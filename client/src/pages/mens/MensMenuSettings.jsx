import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { MENS_GROUPS } from './mensConfig';
import {
  MENS_VISIBILITY_STORAGE_KEY,
  MENS_TOGGLEABLE_TOP_LINKS,
  ALL_MENS_TOGGLEABLE_PATHS,
  isMensPageVisible,
} from './mensVisibilityConfig';
import './MensMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Men's Ministry — "Page Settings" content. Rendered inside the
   shared profile avatar's Page Settings tab (see ProfileModal's
   `pageSettings` prop) on every Men's page. No modal chrome of
   its own — ProfileModal supplies the backdrop/tabs/close button;
   this is just the inner body. Mirrors WomensMenuSettings.jsx.

   Lets a man pick which pages show up in his own copy of the
   Men's Ministry dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this ministry
   and toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function MensMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(MENS_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_MENS_TOGGLEABLE_PATHS.length;
    const visible = ALL_MENS_TOGGLEABLE_PATHS.filter(p => isMensPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isMensPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_MENS_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_MENS_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="mns-set-body">
      <p className="mns-set-hint">
        Choose which pages show up in your Men's Ministry menu (the 🧭 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="mns-set-bulk-row">
        <button type="button" className="mns-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="mns-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {MENS_TOGGLEABLE_TOP_LINKS.length > 0 && (
        <PageGroup
          title="Menu"
          items={MENS_TOGGLEABLE_TOP_LINKS}
          visibility={safeVisibility}
          onToggle={toggle}
          onShowAll={() => showGroup(MENS_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
          onHideAll={() => hideGroup(MENS_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
        />
      )}

      {MENS_GROUPS.map(group => (
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
    <div className="mns-set-group">
      <div className="mns-set-group-head">
        <span className="mns-set-group-title">{title}</span>
        <div className="mns-set-group-bulk">
          <button type="button" className="mns-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="mns-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="mns-set-grid">
        {items.map(item => {
          const on = isMensPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`mns-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="mns-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="mns-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="mns-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
