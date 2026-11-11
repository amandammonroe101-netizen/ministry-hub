import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BLOG_OVERVIEW, BLOG_GROUPS } from './blogConfig';
import { canDetach, isDetached, detachedWithShell } from '../../lib/detached';
import { usePageLocks, isPageLocked } from '../../lib/pageLocks';
import './BlogShell.css';

/* ─────────────────────────────────────────────────────────────
   Blog Ministry — bespoke shell

   A floating trigger + dropdown nav, matching every other ministry
   shell (Website, Women's, Men's, ...) instead of a permanent
   sidebar. Keeps the "Earthy Grove" look (sunrise-photo banner,
   typewriter nav font, ink-drip trail, torn-paper reminder note)
   inside the dropdown panel itself.
   ───────────────────────────────────────────────────────────── */

const TOP_LINKS = [BLOG_OVERVIEW];

const GROUP_ACCENTS = {
  content:    '#6b7f52',
  engagement: '#8c9b76',
};
const DEFAULT_ACCENT = '#4b5d3a';

const PATH_ACCENTS = {};
BLOG_GROUPS.forEach(group => {
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

/* Dew-drop ripple: spawns a short-lived expanding circle at the
   click point on any button that calls it. The button itself needs
   position:relative + overflow:hidden (set in CSS) to contain it. */
function spawnRipple(e) {
  const el = e.currentTarget;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.8;
  const ripple = document.createElement('span');
  ripple.className = 'blg-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

export default function BlogShell({
  title,
  icon,
  subtitle,
  actions,
  headActions,
  avatarInitials,
  avatarTitle,
  onProfileClick,
  fullBleed = false,
  hidePagehead = false,
  hideTopbar = false,
  children,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /* Detached pop-out windows show only this page's content — no nav
     chrome — matching every other detached page. Exception: dragging
     the whole "Blog Ministry" entry off the main rail (rather than
     one sub-page out of the dropdown) keeps this shell's own nav
     dropdown, since that pop-out is meant to carry the whole
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

  /* Page lock: the whole Blog Ministry section can be code-gated
     from Settings → Page Settings (see lib/pageLocks.js). Unlocking
     is session-scoped — a fresh browser session re-prompts. */
  const [pageLocks] = usePageLocks();
  const locked = isPageLocked(pageLocks, 'blog');
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-blog-unlocked') === '1'; }
    catch { return false; }
  });
  const [challenge, setChallenge] = useState({ value: '', error: '' });

  const submitChallenge = () => {
    const code = pageLocks?.blog?.code || '';
    if ((challenge.value || '').trim() !== code.trim()) {
      setChallenge(c => ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setUnlocked(true);
    try { sessionStorage.setItem('mh-blog-unlocked', '1'); } catch {}
  };

  /* Hides the app-wide purple ☰ trigger (NavRail.css) while this
     shell is mounted — Blog Ministry has its own leaf-shaped trigger. */
  useEffect(() => {
    document.body.classList.add('blg-shell-active');
    return () => document.body.classList.remove('blg-shell-active');
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
    const rect = document.querySelector('.blg-nav-dropdown')?.getBoundingClientRect();
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
      <div className="blg-picture-frame">
        <div className="blg-page blg-page-locked">
          <div className="blg-lock-wrap" role="dialog" aria-modal="true" aria-label="Blog Ministry is locked">
            <div className="blg-lock-card">
              <div className="blg-lock-icon" aria-hidden="true">🔒</div>
              <div className="blg-lock-eyebrow">Blog Ministry</div>
              <h2 className="blg-lock-title">This space is locked</h2>
              <p className="blg-lock-sub">Enter the code to continue.</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                className="blg-lock-input"
                placeholder="Code"
                value={challenge.value}
                onChange={e => setChallenge({ value: e.target.value, error: '' })}
                onKeyDown={e => { if (e.key === 'Enter') submitChallenge(); }}
              />
              {challenge.error && <div className="blg-lock-err">{challenge.error}</div>}
              <button
                type="button"
                className="blg-lock-btn"
                onClick={(e) => { spawnRipple(e); submitChallenge(); }}
                disabled={!challenge.value.trim()}
              >
                Unlock
              </button>
              <button
                type="button"
                className="blg-lock-settings-link"
                onClick={(e) => { spawnRipple(e); navigate('/settings'); }}
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
    <div className="blg-picture-frame">
    <div className="blg-page">
      {dragging && (
        <div className="blg-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      <div className="blg-body">
        {!hideTopbar && (
        <header className="blg-topbar">
          {keepNav && (
            <div className="blg-nav-wrap" ref={navWrapRef}>
              <button
                type="button"
                className={`blg-nav-trigger${navOpen ? ' is-open' : ''}`}
                onClick={(e) => { spawnRipple(e); setNavOpen(o => !o); }}
                aria-label="Open Blog Ministry menu"
                aria-expanded={navOpen}
              >
                ✍
              </button>

              {navOpen && (
                <nav className="blg-nav-dropdown">
                  <div className="blg-nav-dropdown-banner">
                    <span className="blg-nav-dropdown-banner-title">Blog Ministry</span>
                    <span className="blg-nav-dropdown-banner-tag">Posts · Ideas · Quotes · Growth</span>
                  </div>
                  <div className="blg-nav-dropdown-drip" aria-hidden="true" />

                  <div className="blg-nav-dropdown-inner">
                    <button type="button" className="blg-exit" onClick={(e) => { spawnRipple(e); navigate('/calendar'); }}>
                      ← Ministry Hub
                    </button>

                    <div className="blg-nav-scroll" ref={navScrollRef}>
                      <div
                        className="blg-nav-pill"
                        style={{
                          transform: `translateY(${pill.top}px)`,
                          height: pill.height || 0,
                          opacity: pill.opacity,
                          background: `linear-gradient(135deg, ${hexToRgba(pill.accent, 0.28)}, ${hexToRgba(pill.accent, 0.08)})`,
                          borderColor: hexToRgba(pill.accent, 0.34),
                        }}
                      />
                      <div className="blg-nav-group">
                        {TOP_LINKS.filter(p => !detachedRoutes.includes(p.path)).map(p => (
                          <NavLink
                            key={p.path}
                            page={p}
                            active={pathname === p.path}
                            onClick={navigate}
                            accent={PATH_ACCENTS[p.path] || DEFAULT_ACCENT}
                            registerRef={registerLink(p.path)}
                            draggable={canDetach() && p.path !== BLOG_OVERVIEW.path}
                            onDragStart={(e) => handleLinkDragStart(e, p.path)}
                            onDragEnd={(e) => handleLinkDragEnd(e, p.path)}
                          />
                        ))}
                      </div>

                      {BLOG_GROUPS.map(group => (
                        <div className="blg-nav-group" key={group.key}>
                          <div className="blg-nav-group-label">{group.icon} {group.label}</div>
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

                    <div className="blg-reminder">
                      <p className="blg-reminder-eyebrow">Today's Reminder</p>
                      <p className="blg-reminder-text">
                        "Every post starts as a nudge — write it down before it fades."
                      </p>
                      <span className="blg-reminder-heart" aria-hidden="true">♥</span>
                    </div>
                  </div>
                </nav>
              )}
            </div>
          )}

          <label className="blg-search">
            <span className="blg-search-icon" aria-hidden="true">🔍</span>
            <input type="text" placeholder="Search posts, quotes, or topics…" />
          </label>
          <div className="blg-topbar-actions">
            {actions}
            <button type="button" className="blg-bell" aria-label="Notifications">
              🔔<span className="blg-bell-dot" aria-hidden="true" />
            </button>
            {onProfileClick && (
              <button
                type="button"
                className="blg-avatar-pill"
                onClick={(e) => { spawnRipple(e); onProfileClick(e); }}
                title={avatarTitle || 'Profile'}
              >
                <span className="blg-avatar">{avatarInitials}</span>
                {avatarTitle && <span className="blg-avatar-name">{avatarTitle}</span>}
              </button>
            )}
          </div>
        </header>
        )}

        {!hidePagehead && (
          <div className="blg-pagehead">
            <div className="blg-crumbs">Blog Ministry</div>
            <div className="blg-pagehead-row">
              <div className="blg-pagehead-titles">
                <div className="blg-title-row">
                  {icon && <span className="blg-title-icon">{icon}</span>}
                  <h1 className="blg-title">{title}</h1>
                </div>
                {subtitle && <p className="blg-subtitle">{subtitle}</p>}
              </div>
              {headActions && <div className="blg-pagehead-actions">{headActions}</div>}
            </div>
          </div>
        )}

        <div className={`blg-content${fullBleed ? ' blg-content-full' : ''}`} key={pathname}>{children}</div>
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
      className={`blg-nav-link${active ? ' is-active' : ''}${draggable ? ' draggable' : ''}`}
      style={{ '--blg-link-accent': accent }}
      onClick={(e) => { spawnRipple(e); onClick(page.path); }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="blg-nav-link-icon">{page.icon}</span>
      <span className="blg-nav-link-label">{page.label}</span>
    </button>
  );
}
