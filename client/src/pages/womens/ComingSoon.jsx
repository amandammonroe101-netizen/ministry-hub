import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import WomensOverviewCalendar from './OverviewCalendar';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import WomensOnboardingModal from './WomensOnboardingModal';
import { useUserStoreKey } from '../../lib/userStore';
import {
  getWomensPage,
  WOMENS_OVERVIEW,
  WOMENS_GROUPS,
  WOMENS_ACCENT,
} from './womensConfig';
import { WOMENS_VISIBILITY_STORAGE_KEY, WOMENS_ONBOARDING_SEEN_KEY } from './womensVisibilityConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Women's — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `womensConfig.js` based on the current route, so a single
   route element can serve every Women's sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <WomensBibleStudies />).
     2. In App.jsx, swap the <WomensComingSoon /> on that
        route for the real component. Keep the entry in
        womensConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function WomensComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getWomensPage(pathname) || WOMENS_OVERVIEW;

  const isOverview = page.path === WOMENS_OVERVIEW.path;
  const accent     = page.accent || WOMENS_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* First-ever visit to the Overview: ask her which pages she wants,
     then never show this again (see WOMENS_ONBOARDING_SEEN_KEY). */
  const [onboardingSeen, setOnboardingSeen, { loading: onboardingLoading }] =
    useUserStoreKey(WOMENS_ONBOARDING_SEEN_KEY, false);
  const [, setPageVisibility] = useUserStoreKey(WOMENS_VISIBILITY_STORAGE_KEY, {});
  const showOnboarding = isOverview && !onboardingLoading && !onboardingSeen;

  const finishOnboarding = (visibility) => {
    setPageVisibility(visibility);
    setOnboardingSeen(true);
  };

  return (
    <WomensShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wmc-root" style={{ '--wmc-accent': accent }}>
        {isOverview && <WomensOverviewCalendar />}

        <div className="wmc-shell">

          {!isOverview && (
            <section className="wmc-card">
              <div className="wmc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="wmc-card-title">This page is on the way</h2>
              <p className="wmc-card-copy">
                The Women's Ministry tab is fully wired into the
                sidebar so each sub-page can be built independently.
                Pick another section from the menu, or jump back to
                the Overview to plan what to tackle next.
              </p>
              <div className="wmc-card-actions">
                <button
                  type="button"
                  className="wmc-btn wmc-btn-primary"
                  onClick={() => navigate(WOMENS_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="wmc-btn wmc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="wmc-map">
              <h2 className="wmc-map-title">Everything in Women's Ministry</h2>
              <p className="wmc-map-sub">
                Click any card to open its page.
              </p>
              {WOMENS_GROUPS.map(group => (
                <div key={group.key} className="wmc-map-group">
                  <h3 className="wmc-map-group-title">
                    <span className="wmc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="wmc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="wmc-map-card"
                        style={{ '--wmc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="wmc-map-card-icon">{item.icon}</span>
                        <span className="wmc-map-card-label">{item.label}</span>
                        <span className="wmc-map-card-desc">{item.description}</span>
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
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />

      {showOnboarding && <WomensOnboardingModal onFinish={finishOnboarding} />}
    </WomensShell>
  );
}
