import { useState } from 'react';
import { YOUTH_GROUPS } from './youthConfig';
import { ALL_YOUTH_TOGGLEABLE_PATHS } from './youthVisibilityConfig';
import './YouthOnboardingModal.css';

/* ─────────────────────────────────────────────────────────────
   Youth Ministry — one-time "pick your pages" modal.
   Shown the first time a leader lands on the Overview (gated in
   Overview.jsx via YOUTH_ONBOARDING_SEEN_KEY). Everything starts
   checked; they uncheck what they don't need. Saving writes the
   resulting map straight to YOUTH_VISIBILITY_STORAGE_KEY (same
   shape YouthMenuSettings reads/writes later), so this is really
   just that same settings screen, asked once up front.
   ───────────────────────────────────────────────────────────── */

export default function YouthOnboardingModal({ onFinish }) {
  const [visibility, setVisibility] = useState(() => {
    const init = {};
    ALL_YOUTH_TOGGLEABLE_PATHS.forEach(p => { init[p] = true; });
    return init;
  });

  const toggle = (path) => setVisibility(prev => ({ ...prev, [path]: !prev[path] }));
  const finish = () => onFinish?.(visibility);

  return (
    <div
      className="yob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your Youth Ministry menu"
      onClick={finish}
    >
      <div className="yob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="yob-head">
          <div className="yob-emoji" aria-hidden="true">⚡</div>
          <div className="yob-eyebrow">Welcome</div>
          <h2 className="yob-title">Make This Space Yours</h2>
          <p className="yob-lead">
            Choose which pages show up in your Youth Ministry menu.
            Everything starts checked — uncheck anything you don't need right now.
          </p>
        </header>

        <div className="yob-body">
          {YOUTH_GROUPS.map(group => (
            <PageGroup
              key={group.key}
              title={`${group.icon} ${group.label}`}
              items={group.items}
              visibility={visibility}
              onToggle={toggle}
            />
          ))}
        </div>

        <footer className="yob-foot">
          <button type="button" className="yob-btn" onClick={finish}>
            Save &amp; Continue
          </button>
          <p className="yob-foot-note">
            You can always change this later from the ⚡ profile circle in the top right.
          </p>
        </footer>
      </div>
    </div>
  );
}

function PageGroup({ title, items, visibility, onToggle }) {
  return (
    <div className="yob-group">
      <div className="yob-group-title">{title}</div>
      <div className="yob-grid">
        {items.map(item => {
          const on = !!visibility[item.path];
          return (
            <label key={item.path} className={`yob-row${on ? ' on' : ''}`}>
              <input
                type="checkbox"
                className="yob-checkbox"
                checked={on}
                onChange={() => onToggle(item.path)}
              />
              <span className="yob-row-icon" aria-hidden="true">{item.icon}</span>
              <div className="yob-row-text">
                <span className="yob-row-label">{item.label}</span>
                <span className="yob-row-desc">{item.description}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
