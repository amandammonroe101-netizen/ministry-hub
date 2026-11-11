import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { DISCIPLESHIP_GROUPS } from './discipleshipConfig';
import {
  DISCIPLESHIP_VISIBILITY_STORAGE_KEY,
  DISCIPLESHIP_TOGGLEABLE_TOP_LINKS,
  ALL_DISCIPLESHIP_TOGGLEABLE_PATHS,
  isDiscipleshipPageVisible,
} from './discipleshipVisibilityConfig';
import './DiscipleshipMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Discipleship Ministry — "Page Settings" content. Rendered inside
   the shared profile avatar's Page Settings tab (see ProfileModal's
   `pageSettings` prop) on every Discipleship page. No modal chrome of
   its own — ProfileModal supplies the backdrop/tabs/close button;
   this is just the inner body. Mirrors WomensMenuSettings.jsx /
   MensMenuSettings.jsx.

   Lets someone pick which pages show up in their own copy of the
   Discipleship Ministry dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this ministry
   and toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function DiscipleshipMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(DISCIPLESHIP_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_DISCIPLESHIP_TOGGLEABLE_PATHS.length;
    const visible = ALL_DISCIPLESHIP_TOGGLEABLE_PATHS.filter(p => isDiscipleshipPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isDiscipleshipPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_DISCIPLESHIP_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_DISCIPLESHIP_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="dps-set-body">
      <p className="dps-set-hint">
        Choose which pages show up in your Discipleship Ministry menu (the 🌿 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="dps-set-bulk-row">
        <button type="button" className="dps-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="dps-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {DISCIPLESHIP_TOGGLEABLE_TOP_LINKS.length > 0 && (
        <PageGroup
          title="Menu"
          items={DISCIPLESHIP_TOGGLEABLE_TOP_LINKS}
          visibility={safeVisibility}
          onToggle={toggle}
          onShowAll={() => showGroup(DISCIPLESHIP_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
          onHideAll={() => hideGroup(DISCIPLESHIP_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
        />
      )}

      {DISCIPLESHIP_GROUPS.map(group => (
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
    <div className="dps-set-group">
      <div className="dps-set-group-head">
        <span className="dps-set-group-title">{title}</span>
        <div className="dps-set-group-bulk">
          <button type="button" className="dps-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="dps-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="dps-set-grid">
        {items.map(item => {
          const on = isDiscipleshipPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`dps-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="dps-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="dps-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="dps-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
