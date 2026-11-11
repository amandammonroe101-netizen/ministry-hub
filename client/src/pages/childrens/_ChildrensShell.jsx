import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CHILDRENS_OVERVIEW, CHILDRENS_GROUPS } from './childrensConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
/* Still pulls in the Youth shell's .yps-* utility classes (inputs,
   buttons, pills, cards, section headers) — every real Children's
   page reuses that shared library for its own body markup, not just
   the old shell chrome. ChildrensShell.css re-skins the ones that
   show up inside .cms-page for the new sunny theme. */
import '../youth/_YouthShell.css';
import './ChildrensShell.css';

/* ─────────────────────────────────────────────────────────────
   Children's Ministry — bespoke shell

   A self-contained nav + header for the Children's section, built
   for the organizers who run it rather than the kids in the room —
   a deep jewel-tone space (sapphire/emerald/amber/ruby/amethyst
   against a near-black backdrop) wrapped in a glossy enamel picture
   frame, with a quiet gem-glyph nav trigger and a sparse drift of
   small diamond/dot/spark shapes standing in for the old toy-emoji
   scatter. Same "own little space" pattern as WomensShell/
   HospitalityShell, just colorful-mature instead of playful.

   Every existing Children's page keeps calling this exact API
   (groupLabel, groupIcon, icon, title, subtitle, accent, actions,
   stats, children) — only the chrome underneath changed, so none
   of the 17+ real sub-pages needed to be touched.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [CHILDRENS_OVERVIEW];

/* Jewel-tone accent per group — deeper, more saturated hues than
   childrensConfig.js's card swatches so the nav pill/link math
   below reads as gemstone-rich rather than pastel-candy. Plain hex
   so it can be blended into rgba. */
const GROUP_ACCENTS = {
  kids:       '#3b82f6', // sapphire
  safety:     '#e11d48', // ruby
  programs:   '#d97706', // topaz
  curriculum: '#0d9488', // emerald
  team:       '#16a34a', // jade
  records:    '#7c3aed', // amethyst
  preschool:  '#c026d3', // orchid
};
const DEFAULT_ACCENT = '#d97706';

const PATH_ACCENTS = {};
CHILDRENS_GROUPS.forEach(group => {
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
   within the cream/sky family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'cms-time-night';
  if (hour < 12) return 'cms-time-morning';
  if (hour < 17) return 'cms-time-afternoon';
  if (hour < 21) return 'cms-time-evening';
  return 'cms-time-night';
}

export default function ChildrensShell({
  groupLabel,
  groupIcon,
  icon,
  title,
  subtitle,
  accent = 'var(--accent-amber, #fbbf24)',
  actions,
  stats,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /* Detached pop-out windows show only this page's content — no nav
     chrome — matching every other detached page. Exception: dragging
     the whole "Children's Ministry" entry off the main rail (rather
     than one sub-page out of the dropdown) keeps this shell's own
     nav dropdown, since that pop-out is meant to carry the whole
     ministry section, not a single page. */
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
     shell is mounted — Children's has its own teddy-bear trigger. */
  useEffect(() => {
    document.body.classList.add('cms-shell-active');
    return () => document.body.classList.remove('cms-shell-active');
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
    const rect = document.querySelector('.cms-nav-dropdown')?.getBoundingClientRect();
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
    <div className="cms-picture-frame">
    <div className={`cms-page ${timeClass}`} style={{ '--yps-accent': accent }}>
      <div className="cms-bloom bloom-a" />
      <div className="cms-bloom bloom-b" />

      {dragging && (
        <div className="cms-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="cms-main">
        <header className="cms-header">
          <div className="cms-header-row">
            {keepNav && (
            <div className="cms-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`cms-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Children's Ministry menu"
                aria-expanded={navOpen}
              >
                ◆
              </button>

              {navOpen && (
                <nav className="cms-nav-dropdown">
                  <button type="button" className="cms-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="cms-brand">
                    <span className="cms-brand-mark">◆</span>
                    <span className="cms-brand-name">Children's Ministry</span>
                  </div>

                  <div className="cms-nav-scroll" ref={navScrollRef}>
                    <div
                      className="cms-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.26)}, ${hexToRgba(pill.accent, 0.08)})`,
                        borderColor: hexToRgba(pill.accent, 0.32),
                      }}
                    />
                    <div className="cms-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={canDetach() && p.path !== CHILDRENS_OVERVIEW.path}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {CHILDRENS_GROUPS.map(group => (
                      <div className="cms-nav-group" key={group.key}>
                        <div className="cms-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="cms-header-text">
              <div className="cms-crumbs">
                Children's Ministry{groupLabel && <> / {groupIcon} {groupLabel}</>}
              </div>
              <div className="cms-title-row">
                {icon && <span className="cms-title-icon">{icon}</span>}
                <h1 className="cms-title">{title}</h1>
                <div className="cms-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="cms-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="cms-subtitle">{subtitle}</p>}
              {Array.isArray(stats) && stats.length > 0 && (
                <div className="cms-stats">
                  {stats.map((s, i) => (
                    <span key={i} className="cms-stat">
                      <b>{s.n}</b> <span>{s.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="cms-content" key={pathname}>{children}</div>
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
      className={`cms-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--cms-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="cms-nav-link-icon">{page.icon}</span>
      <span className="cms-nav-link-label">{page.label}</span>
    </button>
  );
}
