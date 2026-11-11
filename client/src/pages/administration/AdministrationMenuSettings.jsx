import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { ADMINISTRATION_GROUPS } from './administrationConfig';
import {
  ADMINISTRATION_VISIBILITY_STORAGE_KEY,
  ALL_ADMINISTRATION_TOGGLEABLE_PATHS,
  isAdministrationPageVisible,
} from './administrationVisibilityConfig';
import './AdministrationMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Administration Ministry — "Customize Menu" page-settings content.
   Rendered inside the shared profile avatar's Page Settings tab
   (see ProfileModal's `pageSettings` prop) on every Administration page.
   No modal chrome of its own — ProfileModal supplies the
   backdrop/tabs/close button; this is just the inner body.

   Lets a member pick which pages show up in their own copy of the
   Administration dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this one ministry
   and toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function AdministrationMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(ADMINISTRATION_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_ADMINISTRATION_TOGGLEABLE_PATHS.length;
    const visible = ALL_ADMINISTRATION_TOGGLEABLE_PATHS.filter(p => isAdministrationPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isAdministrationPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_ADMINISTRATION_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_ADMINISTRATION_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="ash-set-body">
      <p className="ash-set-hint">
        Choose which pages show up in your Administration menu (the 🏛 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="ash-set-bulk-row">
        <button type="button" className="ash-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="ash-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {ADMINISTRATION_GROUPS.map(group => (
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
    <div className="ash-set-group">
      <div className="ash-set-group-head">
        <span className="ash-set-group-title">{title}</span>
        <div className="ash-set-group-bulk">
          <button type="button" className="ash-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="ash-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="ash-set-grid">
        {items.map(item => {
          const on = isAdministrationPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`ash-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="ash-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="ash-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="ash-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
