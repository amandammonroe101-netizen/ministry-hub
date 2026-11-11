import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { BUSINESS_OVERVIEW, BUSINESS_GROUPS, businessPagePath } from './businessConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { useUserStoreKey } from '../../lib/userStore';
import { BUSINESS_VISIBILITY_STORAGE_KEY, isBusinessPageVisible } from './businessVisibilityConfig';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './BusinessShell.css';

/* ─────────────────────────────────────────────────────────────
   Business / Entrepreneur Ministry — bespoke shell (prototype)

   Mirrors WomensShell.jsx / AdministrationShell.jsx's pattern (own
   dropdown nav, own header, own page lock) with a deep emerald/gold
   "boardroom" visual identity. Replaces NavRail + the shared
   .app-topbar entirely for any page that opts in.

   Unlike every other bespoke shell here, Business is NOT a
   singleton ministry — every page it renders is scoped to whichever
   business the member is currently inside (see businessConfig.js
   for the route shape), so this shell also resolves the current
   :businessId into concrete links and shows a "Switch Business"
   exit back to the businesses overview instead of a normal
   Overview link.
   ───────────────────────────────────────────────────────────── */

/* Per-section accents — reuse the same colors already assigned to
   each group in businessConfig.js so the shell nav and the group
   headers agree. Kept as plain hex here (rather than the CSS
   var(...) strings in businessConfig) since hexToRgba needs a real
   hex value to build the active-pill gradient. */
const GROUP_ACCENTS = {
  products:   '#6ee7b7',
  sales:      '#fbbf24',
  customers:  '#60a5fa',
  finance:    '#2dd4bf',
  marketing:  '#f472b6',
  operations: '#a78bfa',
  team:       '#fb7185',
  growth:     '#059669',
  reflection: '#fbbf24',
};
const DEFAULT_ACCENT = '#059669';

const PATH_ACCENTS = {};
BUSINESS_GROUPS.forEach(group => {
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
   entirely within the emerald/gold family, just shifts warmth. */
function getTimeClass() {
  const hour = new Date().getHours();
  if (hour < 6) return 'bzs-time-night';
  if (hour < 12) return 'bzs-time-morning';
  if (hour < 17) return 'bzs-time-afternoon';
  if (hour < 21) return 'bzs-time-evening';
  return 'bzs-time-night';
}

export default function BusinessShell({
  title,
  icon,
  subtitle,
  businessName,
  businessIcon,
  actions,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { businessId } = useParams();

  const detached = isDetached();
  const keepNav = !detached || detachedWithShell();
  const [timeClass] = useState(getTimeClass);
  const [pill, setPill] = useState({ top: 0, height: 0, opacity: 0, accent: DEFAULT_ACCENT });
  const [navOpen, setNavOpen] = useState(false);

  /* Page lock: the whole Business section can be code-gated from
     Settings → Page Settings (see lib/pageLocks.js). Unlocking is
     session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'business');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-business-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.business?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-business-unlocked', '1'); } catch {}
  };

  /* Which pages this member has chosen to see in their dropdown menu
     — applies across every business, not just the one currently open. */
  const [pageVisibility] = useUserStoreKey(BUSINESS_VISIBILITY_STORAGE_KEY, {});
  const visibleGroups = useMemo(
    () => BUSINESS_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => isBusinessPageVisible(pageVisibility, i.path)) }))
      .filter(group => group.items.length > 0),
    [pageVisibility]
  );

  /* Resolve every group item's ":businessId" template into a real
     link for the currently-open business. */
  const resolvedGroups = useMemo(
    () => visibleGroups.map(group => ({
      ...group,
      items: group.items.map(i => ({ ...i, href: businessPagePath(businessId, i.path) })),
    })),
    [visibleGroups, businessId]
  );

  const [dragging, setDragging] = useState(false);
  const [detachedRoutes, setDetachedRoutes] = useState([]);

  const navScrollRef = useRef(null);
  const linkRefs = useRef(new Map());
  const navWrapRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('bzs-shell-active');
    return () => document.body.classList.remove('bzs-shell-active');
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

  function handleLinkDragStart(e, href) {
    if (!canDetach()) return;
    e.dataTransfer.setData('text/plain', href);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  function handleLinkDragEnd(e, href) {
    setDragging(false);
    if (!canDetach()) return;
    const rect = document.querySelector('.bzs-nav-dropdown')?.getBoundingClientRect();
    const offWindow = e.clientX <= 0 && e.clientY <= 0;
    const outsidePanel = rect
      ? (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
      : true;
    if (offWindow || outsidePanel) {
      window.electronAPI?.openDetached?.(href);
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
  }, [pathname, resolvedGroups]);

  function registerLink(href) {
    return (el) => {
      if (el) linkRefs.current.set(href, el);
      else linkRefs.current.delete(href);
    };
  }

  if (locked && !unlocked) {
    return (
      <div className="bzs-picture-frame">
        <div className={`bzs-page ${timeClass}`}>
          <div className="bzs-glow glow-a" />
          <div className="bzs-glow glow-b" />
          <div className="bzs-lock-wrap" role="dialog" aria-modal="true" aria-label="Business ministry is locked">
            <div className="bzs-lock-card">
              <div className="bzs-lock-icon" aria-hidden="true">🔒</div>
              <div className="bzs-lock-eyebrow">Business / Entrepreneur</div>
              <h2 className="bzs-lock-title">This space is locked</h2>
              <p className="bzs-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="bzs-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="bzs-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="bzs-lock-btn"
                onClick={submitChallenge}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="bzs-lock-settings-link"
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
    <div className="bzs-picture-frame">
    <div className={`bzs-page ${timeClass}`}>
      <div className="bzs-glow glow-a" />
      <div className="bzs-glow glow-b" />
      <div className="bzs-glow glow-c" />

      {dragging && (
        <div className="bzs-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="bzs-main">
        <header className="bzs-header">
          <div className="bzs-header-row">
            {keepNav && (
            <div className="bzs-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`bzs-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={() => setNavOpen(o => !o)}
                aria-label="Open Business menu"
                aria-expanded={navOpen}
              >
                💼
              </button>

              {navOpen && (
                <nav className="bzs-nav-dropdown">
                  <button type="button" className="bzs-exit" onClick={() => navigate(BUSINESS_OVERVIEW.path)}>
                    ⇄ Switch Business
                  </button>
                  <button type="button" className="bzs-exit bzs-exit-secondary" onClick={() => navigate('/calendar')}>
                    ← Ministry Hub
                  </button>

                  <div className="bzs-brand">
                    <span className="bzs-brand-mark">{businessIcon || '🏢'}</span>
                    <span className="bzs-brand-name">{businessName || 'Business'}</span>
                  </div>

                  <div className="bzs-nav-scroll" ref={navScrollRef}>
                    <div
                      className="bzs-nav-pill"
                      style={{
                        transform: `translateY(${pill.top}px)`,
                        height: pill.height || 0,
                        opacity: pill.opacity,
                        background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.24)}, ${hexToRgba(pill.accent, 0.06)})`,
                        borderColor: hexToRgba(pill.accent, 0.3),
                      }}
                    />

                    {resolvedGroups.map(group => (
                      <div className="bzs-nav-group" key={group.key}>
                        <div className="bzs-nav-group-label">{group.icon} {group.label}</div>
                        {group.items.filter(p => !detachedRoutes.includes(p.href)).map(p => (
                          <NavLink
                            key={p.path}
                            page={p}
                            active={pathname === p.href}
                            onClick={navigate}
                            accent={GROUP_ACCENTS[group.key] || DEFAULT_ACCENT}
                            registerRef={registerLink(p.href)}
                            draggable={canDetach()}
                            onDragStart={(e) => handleLinkDragStart(e, p.href)}
                            onDragEnd={(e) => handleLinkDragEnd(e, p.href)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </nav>
              )}
            </div>
            )}

            <div className="bzs-header-text">
              <div className="bzs-crumbs">{businessIcon || '🏢'} {businessName || 'Business'}</div>
              <div className="bzs-title-row">
                {icon && <span className="bzs-title-icon">{icon}</span>}
                <h1 className="bzs-title">{title}</h1>
                <div className="bzs-header-actions">
                  {actions}
                  {onProfileClick && (
                    <button
                      type="button"
                      className="bzs-avatar"
                      onClick={onProfileClick}
                      title={avatarTitle || 'Profile'}
                      aria-label="Open profile"
                    >{avatarInitials}</button>
                  )}
                </div>
              </div>
              {subtitle && <p className="bzs-subtitle">{subtitle}</p>}
            </div>
          </div>
        </header>

        <div className="bzs-content" key={pathname}>{children}</div>
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
      className={`bzs-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--bzs-link-accent': accent }}
      onClick={() => onClick(page.href)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="bzs-nav-link-icon">{page.icon}</span>
      <span className="bzs-nav-link-label">{page.label}</span>
    </button>
  );
}
