import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OutreachShell from './OutreachShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import OutreachMenuSettings from './OutreachMenuSettings';
import OutreachOnboardingModal from './OutreachOnboardingModal';
import { useUserStoreKey } from '../../lib/userStore';
import {
  getOutreachPage,
  OUTREACH_OVERVIEW,
  OUTREACH_GROUPS,
  OUTREACH_ACCENT,
} from './outreachConfig';
import { OUTREACH_VISIBILITY_STORAGE_KEY, OUTREACH_ONBOARDING_SEEN_KEY } from './outreachVisibilityConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Outreach — generic "Coming Soon" page.

   Renders the bespoke OutreachShell (nav + header) and a
   placeholder panel that introduces what the page will become.
   Reads its title / icon / description / accent from
   `outreachConfig.js` based on the current route, so a single
   route element can serve every Outreach sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <OutreachEvangelism />).
     2. In App.jsx, swap the <OutreachComingSoon /> on that
        route for the real component. Keep the entry in
        outreachConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function OutreachComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getOutreachPage(pathname) || OUTREACH_OVERVIEW;

  const isOverview = page.path === OUTREACH_OVERVIEW.path;
  const accent     = page.accent || OUTREACH_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* First-ever visit to the Overview: ask them which pages they want,
     then never show this again (see OUTREACH_ONBOARDING_SEEN_KEY). */
  const [onboardingSeen, setOnboardingSeen, { loading: onboardingLoading }] =
    useUserStoreKey(OUTREACH_ONBOARDING_SEEN_KEY, false);
  const [, setPageVisibility] = useUserStoreKey(OUTREACH_VISIBILITY_STORAGE_KEY, {});
  const showOnboarding = isOverview && !onboardingLoading && !onboardingSeen;

  const finishOnboarding = (visibility) => {
    setPageVisibility(visibility);
    setOnboardingSeen(true);
  };

  return (
    <OutreachShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="oc-root" style={{ '--oc-accent': accent }}>
        <div className="oc-shell">

          {!isOverview && (
            <section className="oc-card">
              <div className="oc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="oc-card-title">This page is on the way</h2>
              <p className="oc-card-copy">
                The Outreach Ministry tab is fully wired into the
                sidebar so each sub-page can be built independently.
                Pick another section from the menu, or jump back to
                the Overview to plan what to tackle next.
              </p>
              <div className="oc-card-actions">
                <button
                  type="button"
                  className="oc-btn oc-btn-primary"
                  onClick={() => navigate(OUTREACH_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="oc-btn oc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="oc-map">
              <h2 className="oc-map-title">Everything in Outreach Ministry</h2>
              <p className="oc-map-sub">
                Click any card to open its page.
              </p>
              {OUTREACH_GROUPS.map(group => (
                <div key={group.key} className="oc-map-group">
                  <h3 className="oc-map-group-title">
                    <span className="oc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="oc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="oc-map-card"
                        style={{ '--oc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="oc-map-card-icon">{item.icon}</span>
                        <span className="oc-map-card-label">{item.label}</span>
                        <span className="oc-map-card-desc">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🤲 Customize Menu"
        pageSettings={<OutreachMenuSettings />}
      />

      {showOnboarding && <OutreachOnboardingModal onFinish={finishOnboarding} />}
    </OutreachShell>
  );
}
