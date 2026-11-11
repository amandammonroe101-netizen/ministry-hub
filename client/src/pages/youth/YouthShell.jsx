import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { YOUTH_OVERVIEW, YOUTH_GROUPS } from './youthConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { YOUTH_VISIBILITY_STORAGE_KEY, isYouthPageVisible } from './youthVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './_YouthShell.css';
import './YouthShell.css';

/* ─────────────────────────────────────────────────────────────
   Youth Ministry — bespoke shell

   A self-contained nav + header for the Youth section, built to
   feel like its own high-energy space — a dark arena backdrop with
   drifting spark/bolt glyphs and an angular ⚡ nav trigger — instead
   of a tab inside the app's default dark glass shell. Replaces the
   old shared _YouthShell (NavRail + generic header) for every page
   that opts in. Same pattern as WomensShell / ChildrensShell:
   own dropdown nav, page-lock gate, and time-of-day accent shift.

   Kept the old _YouthShell prop API (groupLabel, groupIcon, icon,
   title, subtitle, accent, actions, stats, children) so every
   already-built sub-page needed only a swap of the import plus new
   avatarInitials/avatarTitle/onProfileClick props for the profile
   circle — see AllStudents.jsx / Forms.jsx for the pattern.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [YOUTH_OVERVIEW];

/* Per-group accents — same hexes as youthConfig.js's `color` field,
   just written out as plain hex so they can be blended into rgba
   for the pill/link accent math below. "Heaven's Light" palette:
   warm radiant gold + a single ember-red touch carry the shell's
   own chrome (frame, blooms, trigger), the other three groups fan
   out through olive-gold / bronze / deep umber so every group
   stays distinguishable while staying inside one cohesive
   sunlit-gold family — no neon, no purple/pink. */
const GROUP_ACCENTS = {
  students: '#b45309',
  events:   '#b8410c',
  teaching: '#a16207',
  team:     '#854d0e',
  records:  '#713f12',
};
const DEFAULT_ACCENT = '#b45309';

const PATH_ACCENTS = {};
YOUTH_GROUPS.forEach(group => {
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
   dark arena family, just shifts which glow reads hottest. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'yms-time-night';
  if (hour < 12) return 'yms-time-morning';
  if (hour < 17) return 'yms-time-afternoon';
  if (hour < 21) return 'yms-time-evening';
  return 'yms-time-night';
}

export default function YouthShell({
  groupLabel,
  groupIcon,
  icon,
  title,
  subtitle,
  accent = DEFAULT_ACCENT,
  actions,
  stats,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Youth Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'youth');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-youth-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.youth?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-youth-unlocked', '1'); } catch {}
  };

  /* Which pages this leader has chosen to see in their own copy of
     the menu — same model as Women's Ministry, toggled per-page from
     the profile avatar's "Customize Menu" tab (see YouthMenuSettings). */
  const [pageVisibility] = useUserStoreKey(YOUTH_VISIBILITY_STORAGE_KEY, {});
  const visibleGroups = useMemo(
    () => YOUTH_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isYouthPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this
     shell is mounted — Youth Ministry has its own ⚡ trigger. */
  useEffect(() => {
    document.body.classList.add('yms-shell-active');
    return () => document.body.classList.remove('yms-shell-active');
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
    const rect = document.querySelector('.yms-nav-dropdown')?.getBoundingClientRect();
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
      <div className="yms-picture-frame">
        <div className={`yms-page ${timeClass}`}>
          <div className="yms-bloom bloom-a" />
          <div className="yms-bloom bloom-b" />
          <div className="yms-lock-wrap" role="dialog" aria-modal="true" aria-label="Youth Ministry is locked">
            <div className="yms-lock-card">
              <div className="yms-lock-icon" aria-hidden="true">🔒</div>
              <div className="yms-lock-eyebrow">Youth Ministry</div>
              <h2 className="yms-lock-title">This space is locked</h2>
              <p className="yms-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="yms-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="yms-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="yms-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="yms-lock-settings-link"
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
    <div className="yms-picture-frame">
    <div className={`yms-page ${timeClass}`} style={{ '--yps-accent': accent }}>
      <div className="yms-bloom bloom-a" />
      <div className="yms-bloom bloom-b" />
      <div className="yms-sparks" aria-hidden="true">
        {['⚡', '✦', '⚡', '✦', '⚡', '✦', '⚡', '✦'].map((s, i) => (
          <span className="yms-spark" key={i}>{s}</span>
        ))}
      </div>

      {dragging && (
        <div className="yms-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="yms-main">
        <header className="yms-header">
          <div className="yms-header-row">
            {keepNav && (
            <div className="yms-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`yms-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Youth Ministry menu"
                aria-expanded={navOpen}
              >
                ⚡
              </button>

              {navOpen && (
                <nav className="yms-nav-dropdown">
                  <button type="button" className="yms-exit" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="yms-brand">
                    <span className="yms-brand-mark">⚡</span>
                    <span className="yms-brand-name">Youth Ministry</span>
                  </div>

                  <div className="yms-nav-scroll" ref={navScrollRef}>
                    <div
                      className="yms-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.26)}, ${hexToRgba(pill.accent, 0.08)})`,
                        borderColor: hexToRgba(pill.accent, 0.32),
                      }}
                    />
                    <div className="yms-nav-group">
                      {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                        <NavLink
                          key={p.path}
                          page={p}
                          active={pathname === p.path}
                          onClick={navigate}
                          accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                          registerRef={registerLink(p.path)}
                          draggable={false}
                          onDragStart={(e) => handleLinkDragStart(e, p.path)}
                          onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                        />
                      ))}
                    </div>

                    {visibleGroups.map(group => (
                      <div className="yms-nav-group" key={group.key}>
                        <div className="yms-nav-group-label">{group.icon} {group.label}</div>
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

            <div className="yms-header-text">
              <div className="yms-crumbs">
                Youth Ministry{groupLabel && <> / {groupIcon} {groupLabel}</>}
              </div>
              <div className="yms-title-row">
                {icon && <span className="yms-title-icon">{icon}</span>}
                <h1 className="yms-title">{title}</h1>
                <div className="yms-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="yms-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="yms-subtitle">{subtitle}</p>}
              {Array.isArray(stats) && stats.length > 0 && (
                <div className="yms-stats">
                  {stats.map((s, i) => (
                    <span key={i} className="yms-stat">
                      <b>{s.n}</b> <span>{s.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="yms-content" key={pathname}>{children}</div>
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
      className={`yms-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--yms-link-accent': accent }}
      onClick={() => onClick(page.path)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="yms-nav-link-icon">{page.icon}</span>
      <span className="yms-nav-link-label">{page.label}</span>
    </button>
  );
}
