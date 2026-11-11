import { useMemo } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import { OUTREACH_GROUPS } from './outreachConfig';
import {
  OUTREACH_VISIBILITY_STORAGE_KEY,
  ALL_OUTREACH_TOGGLEABLE_PATHS,
  isOutreachPageVisible,
} from './outreachVisibilityConfig';
import './OutreachMenuSettings.css';

/* ─────────────────────────────────────────────────────────────
   Outreach Ministry — "Customize Menu" page-settings content.
   Rendered inside the shared profile avatar's Page Settings tab
   (see ProfileModal's `pageSettings` prop) on every Outreach page.
   No modal chrome of its own — ProfileModal supplies the
   backdrop/tabs/close button; this is just the inner body.

   Lets a member pick which pages show up in their own copy of the
   Outreach Ministry dropdown — same idea as the main app's
   Settings > Visible Categories, just scoped to this one ministry
   and toggled per-page rather than per-ministry.
   ───────────────────────────────────────────────────────────── */

export default function OutreachMenuSettings() {
  const [visibility, setVisibility] = useUserStoreKey(OUTREACH_VISIBILITY_STORAGE_KEY, {});
  const safeVisibility = visibility || {};

  const counts = useMemo(() => {
    const total = ALL_OUTREACH_TOGGLEABLE_PATHS.length;
    const visible = ALL_OUTREACH_TOGGLEABLE_PATHS.filter(p => isOutreachPageVisible(safeVisibility, p)).length;
    return { visible, total };
  }, [safeVisibility]);

  const toggle = (path) => {
    setVisibility(prev => {
      const base = prev || {};
      const cur = isOutreachPageVisible(base, path);
      return { ...base, [path]: !cur };
    });
  };

  const showAll = () => {
    const next = {};
    ALL_OUTREACH_TOGGLEABLE_PATHS.forEach(p => { next[p] = true; });
    setVisibility(next);
  };
  const hideAll = () => {
    const next = {};
    ALL_OUTREACH_TOGGLEABLE_PATHS.forEach(p => { next[p] = false; });
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
    <div className="osh-set-body">
      <p className="osh-set-hint">
        Choose which pages show up in your Outreach Ministry menu (the 🤲 in the top left).
        Overview always stays visible. {counts.visible}/{counts.total} shown.
      </p>

      <div className="osh-set-bulk-row">
        <button type="button" className="osh-set-mini-btn" onClick={showAll}>Show All</button>
        <button type="button" className="osh-set-mini-btn" onClick={hideAll}>Hide All</button>
      </div>

      {OUTREACH_GROUPS.map(group => (
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
    <div className="osh-set-group">
      <div className="osh-set-group-head">
        <span className="osh-set-group-title">{title}</span>
        <div className="osh-set-group-bulk">
          <button type="button" className="osh-set-mini-btn" onClick={onShowAll}>All</button>
          <button type="button" className="osh-set-mini-btn" onClick={onHideAll}>None</button>
        </div>
      </div>
      <div className="osh-set-grid">
        {items.map(item => {
          const on = isOutreachPageVisible(visibility, item.path);
          return (
            <label
              key={item.path}
              className={`osh-set-row${on ? ' on' : ''}`}
              title={on ? `${item.label} — shown in menu` : `${item.label} — hidden from menu`}
            >
              <input
                type="checkbox"
                className="osh-set-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="osh-set-row-icon" aria-hidden="true">{item.icon}</span>
              <span className="osh-set-row-label">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
