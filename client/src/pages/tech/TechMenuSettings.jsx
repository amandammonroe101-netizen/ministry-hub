import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { TECH_GROUPS } from './techConfig';
import {
  TECH_VISIBILITY_STORAGE_KEY,
  TECH_TOGGLEABLE_TOP_LINKS,
  ALL_TECH_TOGGLEABLE_PATHS,
  isTechPageVisible,
} from './techVisibilityConfig';
import './TechMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Tech / Production Ministry — "Page Settings" content. Rendered
   inside the shared profile avatar's Page Settings tab (see
   ProfileModal's `pageSettings` prop) on every Tech page. No modal
   chrome of its own — ProfileModal supplies the backdrop/tabs/close
   button; this is just the inner body. Mirrors MensMenuSettings.jsx.

   Lets a tech volunteer pick which pages show up in their own copy
   of the Tech / Production dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this ministry and
   toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function TechMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(TECH_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_TECH_TOGGLEABLE_PATHS.length;
    const visible = ALL_TECH_TOGGLEABLE_PATHS.filter(p => isTechPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isTechPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_TECH_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_TECH_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
    setVisibility(next);
  };

  const showGroup = (paths) => setVisibility(prev => {
    const next = { ...(prev || {}) };
    paths.forEach(p => { next[p] = true; });
    return next;
  });
  const hideGroup = (paths) => setVisibility(prev => {
    const next = { ...(prev || {}) };
    paths.forEach(p => { next[p] = false; });
    return next;
  });

  return (
    <div className="tps-set-body">
      <p className="tps-set-hint">
        Choose which pages show up in your Tech / Production menu (the 🎛 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="tps-set-bulk-row">
        <button type="button" className="tps-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="tps-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {TECH_TOGGLEABLE_TOP_LINKS.length > 0 && (
        <PageGroup
          title="Menu"
          items={TECH_TOGGLEABLE_TOP_LINKS}
          visibility={safeVisibility}
          onToggle={toggle}
          onShowAll={() => showGroup(TECH_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
          onHideAll={() => hideGroup(TECH_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
        />
      )}

      {TECH_GROUPS.map(group => (
        <PageGroup
          key={group.key}
          title={`${group.icon} ${group.label}`}
          items={group.items}
          visibility={safeVisibility}
          onToggle={toggle}
          onShowAll={() => showGroup(group.items.map(i => i.path))}
          onHideAll={() => hideGroup(group.items.map(i => i.path))}
        />
      ))}
    </div>
  );
}

function PageGroup({ title, items, visibility, onToggle, onShowAll, onHideAll }) {
  return (
    <div className="tps-set-group">
      <div className="tps-set-group-head">
        <span className="tps-set-group-title">{title}</span>
        <div className="tps-set-group-bulk">
          <button type="button" className="tps-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="tps-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="tps-set-grid">
        {items.map(item => {
          const on = isTechPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`tps-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="tps-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="tps-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="tps-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
