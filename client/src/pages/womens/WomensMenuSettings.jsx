import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { WOMENS_GROUPS } from './womensConfig';
import {
  WOMENS_VISIBILITY_STORAGE_KEY,
  WOMENS_TOGGLEABLE_TOP_LINKS,
  ALL_WOMENS_TOGGLEABLE_PATHS,
  isWomensPageVisible,
} from './womensVisibilityConfig';
import './WomensMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — "Customize Menu" page-settings content.
   Rendered inside the shared profile avatar's Page Settings tab
   (see ProfileModal's `pageSettings` prop) on every Women's page.
   No modal chrome of its own — ProfileModal supplies the
   backdrop/tabs/close button; this is just the inner body.

   Lets a woman pick which pages show up in her own copy of the
   Women's Ministry dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this one circle
   and toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function WomensMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(WOMENS_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_WOMENS_TOGGLEABLE_PATHS.length;
    const visible = ALL_WOMENS_TOGGLEABLE_PATHS.filter(p => isWomensPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isWomensPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_WOMENS_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_WOMENS_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="wms-set-body">
      <p className="wms-set-hint">
        Choose which pages show up in your Women's Ministry menu (the 🌹 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="wms-set-bulk-row">
        <button type="button" className="wms-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="wms-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      <PageGroup
        title="Menu"
        items={WOMENS_TOGGLEABLE_TOP_LINKS}
        visibility={safeVisibility}
        onToggle={toggle}
        onShowAll={() => showGroup(WOMENS_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
        onHideAll={() => hideGroup(WOMENS_TOGGLEABLE_TOP_LINKS.map(i => i.path))}
      />

      {WOMENS_GROUPS.map(group => (
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
    <div className="wms-set-group">
      <div className="wms-set-group-head">
        <span className="wms-set-group-title">{title}</span>
        <div className="wms-set-group-bulk">
          <button type="button" className="wms-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="wms-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="wms-set-grid">
        {items.map(item => {
          const on = isWomensPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`wms-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="wms-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="wms-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="wms-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
