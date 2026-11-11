import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HOSPITALITY_OVERVIEW, HOSPITALITY_GROUPS } from './hospitalityConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import './HospitalityShell.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality Ministry — bespoke shell (prototype)

   A self-contained nav + header for the Hospitality section,
   forked from the Women's Ministry shell (WomensShell.jsx) —
   same "own little space instead of a tab in the app" pattern,
   re-skinned as a warm coffeehouse: cream/terracotta surfaces, a
   coffee-cup nav trigger, and a scattered handful of latte-art cups
   in the background instead of falling petals.

   Pages that adopt this shell should stop rendering NavRail /
   .app-topbar themselves and instead wrap their existing body
   markup as children here — see Overview.jsx.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [HOSPITALITY_OVERVIEW];

/* Warm, legible-at-45-50%-lightness accent per group, tinting each
   nav group's active pill + link. Distinct from each other and from
   the base terracotta. */
const GROUP_ACCENTS = {
  team:            '#8b5e3c',
  sunday:          '#c9683f',
  'new-guests':    '#c68a2e',
  food:            '#6f8c5a',
  'special-events':'#9c6b8a',
  operations:      '#6b4226',
  records:         '#3f8c8c',
};
const DEFAULT_ACCENT = '#c9683f';

const PATH_ACCENTS = {};
HOSPITALITY_GROUPS.forEach(group => {
  const color = GROUP_ACCENTS[group.key] || DEFAULT_ACCENT;
  group.items.forEach(item => { PATH_ACCENTS[item.path] = color; });
});

/* A scattered handful of latte-art cups tucked around the edges as
   ambient decoration — one big "anchor" cup (bottom-right, paired
   with bloom-b) plus several smaller, fainter ones at deliberately
   irregular spots/sizes/rotations (no two on the same edge sit at a
   matching height or angle) so the page reads as a loosely scattered
   coffeehouse mural rather than a neat one-per-corner grid. Each one
   gets its own pour (swan, heart, rosetta, or tulip). */
const CUPS = [
  { key: 'br', art: 'swan',    flip: false, style: { bottom: -10, right: -10, width: 380, height: 404, opacity: 0.72, transform: 'rotate(-2deg)' } },
  { key: 'tl', art: 'heart',   flip: true,  style: { top: -20, left: -60, width: 230, height: 244, opacity: 0.24, transform: 'rotate(-13deg)' } },
  { key: 'bl', art: 'rosetta', flip: false, style: { bottom: -56, left: -24, width: 256, height: 272, opacity: 0.3, transform: 'rotate(11deg)' } },
  { key: 'ml', art: 'tulip',   flip: true,  style: { top: '22%', left: -88, width: 184, height: 196, opacity: 0.17, transform: 'rotate(20deg)' } },
  { key: 'tr', art: 'rosetta', flip: true,  style: { top: -6, right: 150, width: 196, height: 209, opacity: 0.2, transform: 'rotate(8deg)' } },
  { key: 'mr', art: 'heart',   flip: false, style: { top: '57%', right: -46, width: 172, height: 183, opacity: 0.23, transform: 'rotate(-15deg)' } },
  { key: 'tr2', art: 'swan',   flip: false, style: { top: -70, right: 20, width: 150, height: 160, opacity: 0.14, transform: 'rotate(24deg)' } },
  { key: 'mid', art: 'tulip',  flip: false, style: { top: '46%', left: '52%', width: 220, height: 234, opacity: 0.22, transform: 'rotate(-6deg)' } },
  { key: 'mid2', art: 'heart', flip: true,  style: { top: '26%', left: '68%', width: 168, height: 179, opacity: 0.16, transform: 'rotate(17deg)' } },
  { key: 'mid3', art: 'rosetta', flip: false, style: { top: '70%', left: '36%', width: 190, height: 202, opacity: 0.18, transform: 'rotate(-19deg)' } },
];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Soft time-of-day gradient variant, chosen once per mount — stays
   within the cream/tan family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'hms-time-night';
  if (hour < 12) return 'hms-time-morning';
  if (hour < 17) return 'hms-time-afternoon';
  if (hour < 21) return 'hms-time-evening';
  return 'hms-time-night';
}

export default function HospitalityShell({
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
     the whole "Hospitality Ministry" entry off the main rail (rather
     than one sub-page out of the dropdown) keeps this shell's own nav
     dropdown, since that pop-out is meant to carry the whole ministry
     section, not a single page. */
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this
     shell is mounted — Hospitality has its own cup-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('hms-shell-active');
    return () => document.body.classList.remove('hms-shell-active');
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
    const rect = document.querySelector('.hms-nav-dropdown')?.getBoundingClientRect();
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
    <div className="hms-picture-frame">
    <div className={`hms-page ${timeClass}`}>
      <div className="hms-bloom bloom-a" />
      <div className="hms-bloom bloom-b" />

      {/* Latte-art watermark — a scattered handful of shaded 3D cups,
          each with its own pour (swan, heart, rosetta, tulip) poured
          into the crema, tucked around the edges as ambient decoration
          (never competes with foreground text). See LatteCup below. */}
      {CUPS.map(cup => (
        <LatteCup key={cup.key} uid={cup.key} flip={cup.flip} art={cup.art} style={cup.style} />
      ))}

      {dragging && (
        <div className="hms-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="hms-main">
        <header className="hms-header">
          <div className="hms-header-row">
            {keepNav && (
            <div className="hms-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`hms-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Hospitality Ministry menu"
                aria-expanded={navOpen}
              >
                ☕
              </button>

              {navOpen && (
                <nav className="hms-nav-dropdown">
                  <button type="button" className="hms-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="hms-brand">
                    <span className="hms-brand-mark">🫘</span>
                    <span className="hms-brand-name">Hospitality</span>
                  </div>

                  <div className="hms-nav-scroll" ref={navScrollRef}>
                    <div
                      className="hms-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />
                    <div className="hms-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== HOSPITALITY_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {HOSPITALITY_GROUPS.map(group => (
                      <div className="hms-nav-group" key={group.key}>
                        <div className="hms-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="hms-header-text">
              <div className="hms-crumbs">Hospitality Ministry</div>
              <div className="hms-title-row">
                {icon && <span className="hms-title-icon">{icon}</span>}
                <h1 className="hms-title">{title}</h1>
                <div className="hms-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="hms-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="hms-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="hms-content" key={pathname}>{children}</div>
      </div>
    </div>
    </div>
  );
}

/* A shaded, faintly 3D coffee cup + saucer with a swan poured into
   the crema. Gradient ids are suffixed with `uid` since several of
   these render at once and SVG ids must be unique per document.
   `flip` mirrors the whole cup (handle + swan) horizontally so
   repeated instances don't all face the same way. The swan itself
   is drawn in an un-squashed local coordinate system, then its <g>
   is scaled down vertically to sit flush inside the foreshortened
   (perspective) coffee-surface ellipse. */
/* Four pour styles, each drawn in the same un-squashed local
   coordinate system (roughly -90..90 on both axes) and centered on
   the cup — LatteCup scales/positions whichever one it's given down
   into the coffee-surface ellipse. */
function SwanArt() {
  return (
    <>
      <path d="M -76 42 Q -22 58 32 20" className="hms-latte-spine" />
      <path d="M -60 44 C -48 24, -34 16, -18 16"  className="hms-latte-feather hms-latte-feather-lg" />
      <path d="M -60 44 C -46 58, -30 62, -16 56"  className="hms-latte-feather hms-latte-feather-lg" />
      <path d="M -34 40 C -24 24, -12 18, 0 20"    className="hms-latte-feather" />
      <path d="M -34 40 C -24 54, -10 58, 2 52"    className="hms-latte-feather" />
      <path d="M -8 32 C 0 20, 10 16, 20 20"       className="hms-latte-feather hms-latte-feather-sm" />
      <path d="M -8 32 C 0 44, 12 46, 20 40"       className="hms-latte-feather hms-latte-feather-sm" />
      <path d="M 32 20 C 55 8, 62 -20, 46 -46 C 34 -66, 8 -74, -8 -60" className="hms-swan-neck" />
      <circle cx="-13" cy="-63" r="10" className="hms-swan-head" />
      <path d="M -23 -66 L -34 -61 L -23 -56 Z" className="hms-swan-beak" />
      <circle cx="-9" cy="-65" r="2.2" className="hms-swan-eye" />
    </>
  );
}

function HeartArt() {
  return (
    <>
      <path d="M 0 58 C -72 8, -62 -58, 0 -18 C 62 -58, 72 8, 0 58 Z" className="hms-latte-heart" />
      <path d="M 0 38 C -42 6, -36 -30, 0 -6" className="hms-latte-heart-sheen" />
    </>
  );
}

function RosettaArt() {
  return (
    <>
      <path d="M 0 74 L 0 -66" className="hms-latte-spine" />
      <path d="M0 52 C -28 46,-46 32,-54 14"  className="hms-latte-feather hms-latte-feather-lg" />
      <path d="M0 52 C 28 46,46 32,54 14"     className="hms-latte-feather hms-latte-feather-lg" />
      <path d="M0 28 C -24 23,-38 12,-44 -2"  className="hms-latte-feather" />
      <path d="M0 28 C 24 23,38 12,44 -2"     className="hms-latte-feather" />
      <path d="M0 4 C -20 0,-30 -10,-34 -22"  className="hms-latte-feather hms-latte-feather-sm" />
      <path d="M0 4 C 20 0,30 -10,34 -22"     className="hms-latte-feather hms-latte-feather-sm" />
      <path d="M0 -20 C -12 -23,-18 -30,-20 -38" className="hms-latte-feather hms-latte-feather-sm" />
      <path d="M0 -20 C 12 -23,18 -30,20 -38"    className="hms-latte-feather hms-latte-feather-sm" />
    </>
  );
}

function TulipArt() {
  return (
    <>
      <path d="M -52 56 Q 0 86 52 56 Q 0 40 -52 56 Z" className="hms-latte-lobe hms-latte-lobe-1" />
      <path d="M -40 20 Q 0 48 40 20 Q 0 4 -40 20 Z"   className="hms-latte-lobe hms-latte-lobe-2" />
      <path d="M -26 -18 Q 0 6 26 -18 Q 0 -32 -26 -18 Z" className="hms-latte-lobe hms-latte-lobe-3" />
      <path d="M 0 -18 L 0 -58" className="hms-latte-spine hms-latte-feather-sm" />
    </>
  );
}

const LATTE_ART = { swan: SwanArt, heart: HeartArt, rosetta: RosettaArt, tulip: TulipArt };

function LatteCup({ uid, flip, art = 'swan', style }) {
  const Art = LATTE_ART[art] || SwanArt;
  const id = (name) => `${name}-${uid}`;
  return (
    <svg className="hms-latte" style={style} viewBox="0 0 320 340" aria-hidden="true">
      <defs>
        <linearGradient id={id('hmsCupBody')} x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0%"  stopColor="#fffefb" />
          <stop offset="42%" stopColor="#f3ece0" />
          <stop offset="72%" stopColor="#e2d2b6" />
          <stop offset="100%" stopColor="#c7b088" />
        </linearGradient>
        <linearGradient id={id('hmsCupHandle')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#fffefb" />
          <stop offset="100%" stopColor="#d3bd97" />
        </linearGradient>
        <radialGradient id={id('hmsCoffee')} cx="34%" cy="28%" r="78%">
          <stop offset="0%"  stopColor="#8a5a34" />
          <stop offset="55%" stopColor="#5c3820" />
          <stop offset="100%" stopColor="#3a2212" />
        </radialGradient>
        <radialGradient id={id('hmsSaucerShadow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(61,40,23,0.30)" />
          <stop offset="100%" stopColor="rgba(61,40,23,0)" />
        </radialGradient>
        <radialGradient id={id('hmsCupGlare')} cx="30%" cy="20%" r="60%">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.65)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <g transform={flip ? 'translate(320,0) scale(-1,1)' : undefined}>
        {/* saucer shadow + saucer */}
        <ellipse cx="165" cy="312" rx="150" ry="24" fill={`url(#${id('hmsSaucerShadow')})`} />
        <ellipse cx="165" cy="300" rx="140" ry="18" fill={`url(#${id('hmsCupBody')})`} stroke="#c7b088" strokeWidth="1.5" />

        {/* cup body — tapered wall down to a narrower base */}
        <path
          d="M 63 178 C 61 232, 74 268, 165 273 C 256 268, 269 232, 267 178 Z"
          fill={`url(#${id('hmsCupBody')})`}
        />
        {/* soft vertical shading groove for ceramic curvature */}
        <path d="M 90 188 C 87 228, 98 254, 132 264" fill="none" stroke="rgba(61,40,23,0.08)" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="120" cy="150" rx="55" ry="30" fill={`url(#${id('hmsCupGlare')})`} />

        {/* handle */}
        <path d="M 262 196 Q 308 200 306 232 Q 304 264 260 258" fill="none" stroke={`url(#${id('hmsCupHandle')})`} strokeWidth="17" strokeLinecap="round" />

        {/* rim + coffee surface */}
        <ellipse cx="165" cy="178" rx="112" ry="46" fill={`url(#${id('hmsCupBody')})`} stroke="#c7b088" strokeWidth="2" />
        <ellipse cx="165" cy="180" rx="97" ry="38" fill={`url(#${id('hmsCoffee')})`} />
        <path d="M 76 168 A 112 46 0 0 1 165 136" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />

        {/* ── Latte art ── */}
        <g transform="translate(165,180) scale(1,0.42)" className="hms-latte-art">
          <Art />
        </g>
      </g>
    </svg>
  );
}

function NavLink({ page, active, onClick, accent, registerRef, draggable, onDragStart, onDragEnd }) {
  return (
    <button
      ref={registerRef}
      type="button"
      className={`hms-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--hms-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="hms-nav-link-icon">{page.icon}</span>
      <span className="hms-nav-link-label">{page.label}</span>
    </button>
  );
}
