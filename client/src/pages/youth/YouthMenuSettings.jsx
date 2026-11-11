import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { YOUTH_GROUPS } from './youthConfig';
import {
  YOUTH_VISIBILITY_STORAGE_KEY,
  ALL_YOUTH_TOGGLEABLE_PATHS,
  isYouthPageVisible,
} from './youthVisibilityConfig';
import './YouthMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Youth Ministry — "Customize Menu" page-settings content.
   Rendered inside the shared profile avatar's Page Settings tab
   (see ProfileModal's `pageSettings` prop) on every Youth page.
   No modal chrome of its own — ProfileModal supplies the
   backdrop/tabs/close button; this is just the inner body.

   Lets a leader pick which pages show up in their own copy of the
   Youth Ministry dropdown — same idea as Women's Ministry's
   Customize Menu, just scoped to this section.
   ───────────────────────────────────────────────────────────── */

export default function YouthMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(YOUTH_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_YOUTH_TOGGLEABLE_PATHS.length;
    const visible = ALL_YOUTH_TOGGLEABLE_PATHS.filter(p => isYouthPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isYouthPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_YOUTH_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_YOUTH_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="yms-set-body">
      <p className="yms-set-hint">
        Choose which pages show up in your Youth Ministry menu (the ⚡ in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="yms-set-bulk-row">
        <button type="button" className="yms-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="yms-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {YOUTH_GROUPS.map(group => (
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
    <div className="yms-set-group">
      <div className="yms-set-group-head">
        <span className="yms-set-group-title">{title}</span>
        <div className="yms-set-group-bulk">
          <button type="button" className="yms-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="yms-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="yms-set-grid">
        {items.map(item => {
          const on = isYouthPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`yms-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="yms-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="yms-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="yms-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
