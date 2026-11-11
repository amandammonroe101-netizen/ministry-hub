import { useState } from 'react';
/* HashRouter (not BrowserRouter): the packaged Electron app loads from a
   file:// URL, where path-based routing can't read a deep route. The hash
   (#/calendar) routes reliably under file:// and still works in the dev
   server. Detached pop-out windows pass their route via the query string
   (see lib/detached.js), so they're unaffected by the hash. */
import { HashRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import FounderRoute from './components/FounderRoute';
import { AuthProvider } from './context/AuthContext';
import NavRail from './components/layout/NavRail';
import WindowSync from './components/WindowSync';
import DailyVerseSplash from './components/DailyVerseSplash';
import DailySummary from './components/DailySummary';
import WelcomePopup from './components/WelcomePopup';
import { shouldShowBriefing, BRIEFING_ENABLED_KEY, isBriefingEnabled } from './lib/dailyBriefing';
import { auth } from './lib/firebase';
import { getValue, setValue } from './lib/userStore';
import { isDetached, detachedRoute } from './lib/detached';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Journal from './pages/journal/Journal';
import Prayers from './pages/prayers/Prayers';
import Friends from './pages/friends/Friends';
import Contacts from './pages/contacts/Contacts';
import Calendar from './pages/calendar/Calendar';
import Chat from './pages/chat/Chat';
import Songs from './pages/songs/Songs';
import Studio from './pages/studio/Studio';
import Multitrack from './pages/multitrack/Multitrack';
import Drums from './pages/drums/Drums';
import Seaboard from './pages/seaboard/Seaboard';
import Akai from './pages/akai/Akai';
import SoundCreator from './pages/soundcreator/SoundCreator';
import Setlist from './pages/setlist/Setlist';
import ServiceBuilder from './pages/servicebuilder/ServiceBuilder';
import LyricsDisplay from './pages/lyricsdisplay/LyricsDisplay';
import Countdown from './pages/countdown/Countdown';
import Roster from './pages/roster/Roster';
import Scheduling from './pages/scheduling/Scheduling';
import Subs from './pages/subs/Subs';
import Onboarding from './pages/onboarding/Onboarding';
import Themes from './pages/themes/Themes';
import CcliLog from './pages/ccli/CcliLog';
import ChordCharts from './pages/charts/ChordCharts';
import StemsLibrary from './pages/stems/StemsLibrary';
import MixNotes from './pages/mixnotes/MixNotes';
import SchedulingRec from './pages/schedulingrec/SchedulingRec';
import Inventory from './pages/inventory/Inventory';
import MaintenanceLog from './pages/maintenance/MaintenanceLog';
import StagePlot from './pages/stageplot/StagePlot';
import TechIssues from './pages/techissues/TechIssues';
import Budget from './pages/budget/Budget';
import Documents from './pages/documents/Documents';
import Meetings from './pages/meetings/Meetings';
import Backup from './pages/backup/Backup';
import PageAudit from './pages/sitepages/PageAudit';
import FormsTracker from './pages/siteforms/FormsTracker';
import TechStack from './pages/sitetechstack/TechStack';
import StyleGuide from './pages/styleguide/StyleGuide';
import UpdateLog from './pages/updatelog/UpdateLog';
import SiteIssues from './pages/siteissues/SiteIssues';
import SeoHealth from './pages/seohealth/SeoHealth';
import Hosting from './pages/hosting/Hosting';
import VisitorFeedback from './pages/visitorfeedback/VisitorFeedback';
import WebsiteComingSoon from './pages/website/ComingSoon';
import { WEBSITE_PAGES } from './pages/website/websiteConfig';
import BlogPosts from './pages/blogposts/BlogPosts';
import BlogPostEditor from './pages/blogposts/BlogPostEditor';
import BlogIdeas from './pages/blogideas/BlogIdeas';
import BlogQuotes from './pages/blogquotes/BlogQuotes';
import BlogSeries from './pages/blogseries/BlogSeries';
import BlogAuthors from './pages/blogauthors/BlogAuthors';
import BlogComments from './pages/blogcomments/BlogComments';
import BlogNewsletters from './pages/blognewsletters/BlogNewsletters';
import BlogPerformance from './pages/blogperformance/BlogPerformance';
import BlogOverview from './pages/blog/BlogOverview';
import { BLOG_PAGES } from './pages/blog/blogConfig';
import PodcastStudio from './pages/podcaststudio/PodcastStudio';
import PodcastRecordings from './pages/podcastrecordings/PodcastRecordings';
import PodcastEditor from './pages/podcasteditor/PodcastEditor';
import PodcastScenes from './pages/podcastscenes/PodcastScenes';
import YouthComingSoon from './pages/youth/ComingSoon';
import { YOUTH_PAGES } from './pages/youth/youthConfig';
import YouthAllStudents from './pages/youth/AllStudents';
import YouthBibleStudies from './pages/youth/BibleStudies';
import YouthVisitors from './pages/youth/Visitors';
import YouthOverview from './pages/youth/Overview';
import YouthWeeklyNights from './pages/youth/WeeklyNights';
import YouthTrips from './pages/youth/Trips';
import YouthOutreach from './pages/youth/Outreach';
import YouthLessons from './pages/youth/Lessons';
import YouthGames from './pages/youth/Games';
import YouthLeaders from './pages/youth/Leaders';
import YouthParents from './pages/youth/Parents';
import YouthForms from './pages/youth/Forms';
import YouthArchive from './pages/youth/Archive';
import ChildrensComingSoon from './pages/childrens/ComingSoon';
import { CHILDRENS_PAGES } from './pages/childrens/childrensConfig';
/* Children's Ministry — real pages (replaces ComingSoon route-by-route) */
import ChildrensOverview          from './pages/childrens/Overview';
import ChildrensAllKids           from './pages/childrens/AllKids';
import ChildrensAgeGroups         from './pages/childrens/AgeGroups';
import ChildrensMedical           from './pages/childrens/Medical';
import ChildrensCheckIn           from './pages/childrens/CheckIn';
import ChildrensPickup            from './pages/childrens/Pickup';
import ChildrensIncidents         from './pages/childrens/Incidents';
import ChildrensBackgroundChecks  from './pages/childrens/BackgroundChecks';
import ChildrensSunday            from './pages/childrens/Sunday';
import ChildrensMidweek           from './pages/childrens/Midweek';
import ChildrensVBS               from './pages/childrens/VBS';
import ChildrensLessons           from './pages/childrens/Lessons';
import ChildrensCrafts            from './pages/childrens/Crafts';
import ChildrensTakeHome          from './pages/childrens/TakeHome';
import ChildrensVolunteers        from './pages/childrens/Volunteers';
import ChildrensParents           from './pages/childrens/Parents';
import ChildrensForms             from './pages/childrens/Forms';
import ChildrensSnacks            from './pages/childrens/Snacks';
import ChildrensArchive           from './pages/childrens/Archive';
import OutreachComingSoon from './pages/outreach/ComingSoon';
import OutreachContacts from './pages/outreach/OutreachContacts';
import OutreachFollowUps from './pages/outreach/OutreachFollowUps';
import OutreachCommunityService from './pages/outreach/OutreachCommunityService';
import { OUTREACH_PAGES } from './pages/outreach/outreachConfig';
import WomensComingSoon from './pages/womens/ComingSoon';
import { WOMENS_PAGES } from './pages/womens/womensConfig';
import WomensMyInvolvement from './pages/womens/MyInvolvement';
import WomensAllWomen from './pages/womens/AllWomen';
import WomensNewToMinistry from './pages/womens/NewToMinistry';
import WomensLifeStages from './pages/womens/LifeStages';
import WomensBibleStudies from './pages/womens/BibleStudies';
import WomensMentorship from './pages/womens/Mentorship';
import WomensPrayerGroups from './pages/womens/PrayerGroups';
import WomensBrunchesAndTeas from './pages/womens/BrunchesAndTeas';
import WomensRetreats from './pages/womens/Retreats';
import WomensConferences from './pages/womens/Conferences';
import WomensFellowship from './pages/womens/Fellowship';
import WomensMealTrain from './pages/womens/MealTrain';
import WomensNewMomSupport from './pages/womens/NewMomSupport';
import WomensCrisis from './pages/womens/Crisis';
import WomensSupportGroups from './pages/womens/SupportGroups';
import WomensResourceLibrary from './pages/womens/ResourceLibrary';
import WomensSavedResources from './pages/womens/SavedResources';
import WomensReferralDirectory from './pages/womens/ReferralDirectory';
import WomensCommunication from './pages/womens/Communication';
import WomensLeaders from './pages/womens/Leaders';
import WomensStories from './pages/womens/Stories';
import WomensArchive from './pages/womens/Archive';
import WomensEngagement from './pages/womens/Engagement';
import MensComingSoon from './pages/mens/ComingSoon';
import { MENS_PAGES } from './pages/mens/mensConfig';
import MensAllMen from './pages/mens/AllMen';
import TechComingSoon from './pages/tech/ComingSoon';
import { TECH_PAGES } from './pages/tech/techConfig';
import MissionsComingSoon from './pages/missions/ComingSoon';
import MissionsSentOnes from './pages/missions/SentOnes';
import MissionsUpcomingTrips from './pages/missions/UpcomingTrips';
import MissionsPrayerRequests from './pages/missions/PrayerRequests';
import MissionsFieldUpdates from './pages/missions/FieldUpdates';
import { MISSIONS_PAGES } from './pages/missions/missionsConfig';
import WorshipOverview from './pages/worship/Overview';
import WorshipComingSoon from './pages/worship/ComingSoon';
import { WORSHIP_PAGES } from './pages/worship/worshipConfig';
import HospitalityComingSoon from './pages/hospitality/ComingSoon';
import HospitalityOverview from './pages/hospitality/Overview';
import { HOSPITALITY_PAGES } from './pages/hospitality/hospitalityConfig';
import HospitalityAllHosts from './pages/hospitality/AllHosts';
import HospitalityRolesAndPositions from './pages/hospitality/RolesAndPositions';
import HospitalityInTraining from './pages/hospitality/InTraining';
import HospitalityParkingLot from './pages/hospitality/ParkingLot';
import HospitalityGreeters from './pages/hospitality/Greeters';
import HospitalityWelcomeCenter from './pages/hospitality/WelcomeCenter';
import HospitalityUshers from './pages/hospitality/Ushers';
import HospitalityOffering from './pages/hospitality/Offering';
import HospitalityFollowUpPipeline from './pages/hospitality/FollowUpPipeline';
import HospitalityGifts from './pages/hospitality/Gifts';
import HospitalityConnectEvents from './pages/hospitality/ConnectEvents';
import HospitalityCoffee from './pages/hospitality/Coffee';
import HospitalityMeals from './pages/hospitality/Meals';
import HospitalityCatering from './pages/hospitality/Catering';
import HospitalityWeddings from './pages/hospitality/Weddings';
import HospitalityFunerals from './pages/hospitality/Funerals';
import HospitalityHoliday from './pages/hospitality/Holiday';
import HospitalityScheduling from './pages/hospitality/Scheduling';
import HospitalityPreService from './pages/hospitality/PreService';
import HospitalitySetup from './pages/hospitality/Setup';
import HospitalityCommunication from './pages/hospitality/Communication';
import HospitalityEngagement from './pages/hospitality/Engagement';
import HospitalityStories from './pages/hospitality/Stories';
import HospitalityArchive from './pages/hospitality/Archive';
import DiscipleshipComingSoon from './pages/discipleship/ComingSoon';
import { DISCIPLESHIP_PAGES } from './pages/discipleship/discipleshipConfig';
import AdministrationComingSoon from './pages/administration/ComingSoon';
import { ADMINISTRATION_PAGES } from './pages/administration/administrationConfig';
import PastoralComingSoon from './pages/pastoral/ComingSoon';
import { PASTORAL_PAGES } from './pages/pastoral/pastoralConfig';
import AuthorComingSoon from './pages/author/ComingSoon';
import { AUTHOR_PAGES } from './pages/author/authorConfig';
import Testimony from './pages/testimony/Testimony';
import Library from './pages/library/Library';
import DayPlanner from './pages/dayplanner/DayPlanner';
import Writing from './pages/writing/Writing';
import SocialMediaComingSoon from './pages/socialmedia/ComingSoon';
import { SOCIAL_MEDIA_PAGES } from './pages/socialmedia/socialMediaConfig';
import Settings from './pages/settings/Settings';
import FounderDashboard from './pages/founder/FounderDashboard';
import BusinessOverview from './pages/business/BusinessOverview';
import BusinessProductCatalog from './pages/business/ProductCatalog';
import BusinessProductPricing from './pages/business/ProductPricing';
import BusinessOrders from './pages/business/BusinessOrders';
import BusinessInvoices from './pages/business/BusinessInvoices';
import BusinessCustomers from './pages/business/BusinessCustomers';
import BusinessInventory from './pages/business/BusinessInventory';
import BusinessDemand from './pages/business/BusinessDemand';
import PublicInvoice from './pages/business/PublicInvoice';
import BusinessComingSoon from './pages/business/BusinessComingSoon';
import { BUSINESS_OVERVIEW, BUSINESS_GROUP_PAGES } from './pages/business/businessConfig';

/* Wraps every protected route: gate, background orbs, global NavRail,
   then the routed page via <Outlet/>. Pulled out of App() into its own
   component so it can call useLocation() — App() itself renders
   <HashRouter> as its return value, so it sits outside the Router context
   and can't call router hooks directly. */
function ProtectedShell() {
  const detached = isDetached();
  const { pathname } = useLocation();
  /* Missions Ministry and Worship Ministry each have their own bespoke
     shell with its own nav dropdown (MissionsShell.jsx / WorshipShell.jsx),
     so the global floating ☰ NavRail trigger is redundant there —
     suppress it for every /missions/* and /worship/* route. */
  const hideNavRail = pathname.startsWith('/missions') || pathname.startsWith('/worship');
  /* Blog Ministry has its own full-bleed wood-photo-frame background
     (.blg-page, set in BlogShell.css) that's meant to be the only
     backdrop visible throughout the whole section — so skip the
     global purple/pink/teal orb background there instead of letting
     it render (harmlessly, but pointlessly) underneath. */
  const hideAppBg = pathname.startsWith('/blog');

  return (
    <ProtectedRoute>
      {!hideAppBg && (
        <div className="app-bg" aria-hidden="true">
          <div className="orb o1" /><div className="orb o2" />
          <div className="orb o3" /><div className="orb o4" />
          <div className="orb o5" />
        </div>
      )}
      {/* Global NavRail — slide-out dropdown sidebar rendered
          once for every protected route, so the floating ☰
          trigger appears on EVERY page (no per-page render
          needed). Pages that still render their own
          <NavRail/> mount a second instance for backwards
          compatibility; the rail is fixed-positioned, so
          the duplicate doesn't break any page layout. */}
      {!detached && !hideNavRail && <NavRail />}
      {/* Vertical shell — page fills the full area below the
          NavRail. 100vh height + overflow:hidden so pages that
          style themselves with `height:100vh` stay inside the
          viewport instead of overflowing it. The global
          AppHeader topbar has been removed from every route;
          pages that need their own topbar (Journal, Prayers,
          Friends, Calendar, Day Planner, Songs, etc.) render it
          themselves. */}
      <div className="app-shell">
        <Outlet />
      </div>
    </ProtectedRoute>
  );
}

export default function App() {
  /* Detached pop-out windows render the same app but suppress the
     global chrome (NavRail) so a single page shows on its own. See
     client/src/lib/detached.js. */
  const detached = isDetached();

  /* Where "/" and unknown URLs land. Normal windows always open to the
     Calendar; a detached pop-out goes straight to its assigned route so
     there's no flash of the Calendar before WindowSync redirects. */
  const homeRoute = detached ? (detachedRoute() || '/calendar') : '/calendar';

  /* Daily Summary — a per-page "what's new" carousel. Opens once on the
     first app launch of each day, right after the Verse of the Day splash
     is dismissed. Gated to once per day + a signed-in user (see
     lib/dailyBriefing). Skipped in detached pop-out windows. */
  const [showBriefing, setShowBriefing] = useState(false);

  /* Welcome — a one-time greeting shown on a brand-new account's very
     first launch, IN PLACE OF the summary, to point out that this spot
     is where the daily briefing for the Personal Pages will live. Gated
     per-account via a persistent store flag so it appears exactly once. */
  const WELCOME_KEY = 'onboarding:welcome-seen';
  const [showWelcome, setShowWelcome] = useState(false);

  const handleSplashDismiss = async () => {
    if (detached) return;
    const uid = auth?.currentUser?.uid;
    if (uid) {
      let seen = false;
      try { seen = !!(await getValue(uid, WELCOME_KEY)); } catch { /* default: show */ }
      if (!seen) { setShowWelcome(true); return; } // welcome instead of summary, just once
      /* Master on/off: if the user turned the Daily Summary off in
         Settings, never show it (defaults on when unset). */
      try {
        if (!isBriefingEnabled(await getValue(uid, BRIEFING_ENABLED_KEY))) return;
      } catch { /* default: show */ }
    }
    if (shouldShowBriefing()) setShowBriefing(true);
  };

  const closeWelcome = async () => {
    setShowWelcome(false);
    const uid = auth?.currentUser?.uid;
    if (uid) { try { await setValue(uid, WELCOME_KEY, true); } catch { /* will retry next launch */ } }
  };

  return (
    <HashRouter>
      <AuthProvider>
        <WindowSync />
        {/* Daily verse splash — shows the day's verse over the sunset
            background on every app open. Double-click anywhere to enter.
            Skipped in detached pop-out windows (they're not "opening
            the app", just a secondary surface). */}
        {!detached && <DailyVerseSplash onDismiss={handleSplashDismiss} />}
        {/* One-time welcome on a new account's first launch — shown
            instead of the summary to introduce the daily briefing spot. */}
        {showWelcome && <WelcomePopup onClose={closeWelcome} />}
        {/* Daily Summary — a per-page "what's new" carousel (Journal,
            Prayers, Friends, Day Planner, Chat), opened once a day right
            after the verse splash. Step through with the Next button. */}
        {showBriefing && (
          <DailySummary onClose={() => setShowBriefing(false)} />
        )}
        <Routes>
          {/* Public auth routes — no ProtectedRoute wrapper */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Public invoice share link (Business Ministry) — reads a
              read-only snapshot from /publicInvoices/{token}, no
              sign-in required. See BusinessInvoices.jsx / PublicInvoice.jsx. */}
          <Route path="/invoice/:token" element={<PublicInvoice />} />

          {/* Every other route requires a signed-in user. We nest them under
              a single parent route whose element is <ProtectedRoute><Outlet/></ProtectedRoute>,
              so the gate runs once and the children render through the Outlet.
              The .app-bg div sits behind everything (z-index 0) so the
              animated multi-color orbs are visible on every page that has
              a transparent root container — except Blog Ministry (/blog*),
              which supplies its own full-bleed photo background instead
              (see hideAppBg in ProtectedShell). */}
          <Route element={<ProtectedShell />}>
        <Route path="/"         element={<Navigate to={homeRoute} replace />} />
        <Route path="/journal"  element={<Journal />} />
        <Route path="/prayers"  element={<Prayers />} />
        <Route path="/friends"  element={<Friends />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/chat"        element={<Chat />} />
        <Route path="/testimony"   element={<ErrorBoundary pageName="Testimony"><Testimony /></ErrorBoundary>} />
        <Route path="/library"     element={<ErrorBoundary pageName="Library"><Library /></ErrorBoundary>} />
        <Route path="/day-planner" element={<ErrorBoundary pageName="Day Planner"><DayPlanner /></ErrorBoundary>} />
        <Route path="/writing" element={<ErrorBoundary pageName="Writing Mode"><Writing /></ErrorBoundary>} />
        <Route path="/settings"    element={<ErrorBoundary pageName="Settings"><Settings /></ErrorBoundary>} />
        <Route path="/founder"     element={<FounderRoute><ErrorBoundary pageName="Founder Dashboard"><FounderDashboard /></ErrorBoundary></FounderRoute>} />
        {/* Worship Ministry — same pattern: routes generated from
            worshipConfig.WORSHIP_PAGES, resolved to a real
            component for every existing page (ComingSoon kept as
            the fallback for any path not yet wired). */}
        {WORSHIP_PAGES.map(p => {
          const Component =
              p.path === '/worship'                       ? WorshipOverview
            : p.path === '/worship/live/setlist'           ? Setlist
            : p.path === '/worship/live/service-builder'   ? ServiceBuilder
            : p.path === '/worship/live/lyrics'            ? LyricsDisplay
            : p.path === '/worship/live/countdown'         ? Countdown
            : p.path === '/worship/instruments/piano'      ? Studio
            : p.path === '/worship/instruments/drums'      ? Drums
            : p.path === '/worship/instruments/seaboard'   ? Seaboard
            : p.path === '/worship/instruments/akai'       ? Akai
            : p.path === '/worship/instruments/sound-creator' ? SoundCreator
            : p.path === '/worship/production/multitrack'  ? Multitrack
            : p.path === '/worship/production/stems'       ? StemsLibrary
            : p.path === '/worship/production/mix-notes'   ? MixNotes
            : p.path === '/worship/production/scheduling-rec' ? SchedulingRec
            : p.path === '/worship/songs/all'              ? Songs
            : p.path === '/worship/songs/themes'           ? Themes
            : p.path === '/worship/songs/ccli'             ? CcliLog
            : p.path === '/worship/songs/charts'           ? ChordCharts
            : p.path === '/worship/team/roster'            ? Roster
            : p.path === '/worship/team/scheduling'        ? Scheduling
            : p.path === '/worship/team/subs'              ? Subs
            : p.path === '/worship/team/onboarding'        ? Onboarding
            : p.path === '/worship/gear/inventory'         ? Inventory
            : p.path === '/worship/gear/maintenance'       ? MaintenanceLog
            : p.path === '/worship/gear/stage-plot'        ? StagePlot
            : p.path === '/worship/gear/tech-issues'       ? TechIssues
            : p.path === '/worship/admin/budget'           ? Budget
            : p.path === '/worship/admin/documents'        ? Documents
            : p.path === '/worship/admin/meetings'         ? Meetings
            : p.path === '/worship/admin/backup'           ? Backup
            :                                                WorshipComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Worship — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Website Ministry — routes generated from
            websiteConfig.WEBSITE_PAGES, resolved to a real component
            for every page (ComingSoon kept as the fallback for any
            path not yet wired). */}
        {WEBSITE_PAGES.map(p => {
          const Component =
              p.path === '/site-pages'      ? PageAudit
            : p.path === '/site-forms'      ? FormsTracker
            : p.path === '/site-tech-stack' ? TechStack
            : p.path === '/style-guide'     ? StyleGuide
            : p.path === '/update-log'      ? UpdateLog
            : p.path === '/site-issues'     ? SiteIssues
            : p.path === '/seo'             ? SeoHealth
            : p.path === '/hosting'         ? Hosting
            : p.path === '/feedback'        ? VisitorFeedback
            :                                 WebsiteComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Website — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Blog Ministry — routes generated from blogConfig.BLOG_PAGES,
            resolved to a real component for every page (BlogOverview
            kept as the fallback for any path not yet wired, and as
            the Overview page itself). */}
        {BLOG_PAGES.map(p => {
          const Component =
              p.path === '/blog-posts'        ? BlogPosts
            : p.path === '/blog-ideas'        ? BlogIdeas
            : p.path === '/blog-quotes'       ? BlogQuotes
            : p.path === '/blog-series'       ? BlogSeries
            : p.path === '/blog-authors'      ? BlogAuthors
            : p.path === '/blog-comments'     ? BlogComments
            : p.path === '/blog-newsletters'  ? BlogNewsletters
            : p.path === '/blog-performance'  ? BlogPerformance
            :                                    BlogOverview;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Blog — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Blog Post Editor — deliberately NOT in blogConfig.BLOG_PAGES
            (so it never appears as a nav link). Opened from Posts
            Library as a pop-out window in Electron, or a same-window
            navigation elsewhere, with the post id passed via ?id=. */}
        <Route path="/blog-post-editor" element={<ErrorBoundary pageName="Blog — Post Editor"><BlogPostEditor /></ErrorBoundary>} />
        <Route path="/podcast-studio"     element={<ErrorBoundary pageName="Podcast Studio"><PodcastStudio /></ErrorBoundary>} />
        <Route path="/podcast-recordings" element={<ErrorBoundary pageName="Podcast Recordings"><PodcastRecordings /></ErrorBoundary>} />
        <Route path="/podcast-editor"     element={<ErrorBoundary pageName="Podcast Editor"><PodcastEditor /></ErrorBoundary>} />
        <Route path="/podcast-scenes"     element={<ErrorBoundary pageName="Podcast Scenes"><PodcastScenes /></ErrorBoundary>} />
        {/* Youth Ministry — every sub-page renders the shared
            ComingSoon component until its real implementation lands.
            Routes are generated from youthConfig.YOUTH_PAGES so adding
            a new entry there automatically wires it up. */}
        {YOUTH_PAGES.map(p => {
          /* Every Youth route now has a real page. ComingSoon is
             kept as a fallback in case a path is added in
             youthConfig before its component is wired here. */
          const Component =
              p.path === '/youth'               ? YouthOverview
            : p.path === '/youth/students'      ? YouthAllStudents
            : p.path === '/youth/bible-studies' ? YouthBibleStudies
            : p.path === '/youth/visitors'      ? YouthVisitors
            : p.path === '/youth/weekly-nights' ? YouthWeeklyNights
            : p.path === '/youth/trips'         ? YouthTrips
            : p.path === '/youth/outreach'      ? YouthOutreach
            : p.path === '/youth/lessons'       ? YouthLessons
            : p.path === '/youth/games'         ? YouthGames
            : p.path === '/youth/leaders'       ? YouthLeaders
            : p.path === '/youth/parents'       ? YouthParents
            : p.path === '/youth/forms'         ? YouthForms
            : p.path === '/youth/archive'       ? YouthArchive
            :                                     YouthComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Youth — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Children's Ministry — routes generated from
            childrensConfig.CHILDRENS_PAGES, each path resolved to
            its real page component (ComingSoon kept as the fallback
            for any path not yet wired). */}
        {CHILDRENS_PAGES.map(p => {
          const Component =
              p.path === '/childrens'                    ? ChildrensOverview
            : p.path === '/childrens/kids'               ? ChildrensAllKids
            : p.path === '/childrens/age-groups'         ? ChildrensAgeGroups
            : p.path === '/childrens/medical'            ? ChildrensMedical
            : p.path === '/childrens/check-in'           ? ChildrensCheckIn
            : p.path === '/childrens/pickup'             ? ChildrensPickup
            : p.path === '/childrens/incidents'          ? ChildrensIncidents
            : p.path === '/childrens/background-checks'  ? ChildrensBackgroundChecks
            : p.path === '/childrens/sunday'             ? ChildrensSunday
            : p.path === '/childrens/midweek'            ? ChildrensMidweek
            : p.path === '/childrens/vbs'                ? ChildrensVBS
            : p.path === '/childrens/lessons'            ? ChildrensLessons
            : p.path === '/childrens/crafts'             ? ChildrensCrafts
            : p.path === '/childrens/take-home'          ? ChildrensTakeHome
            : p.path === '/childrens/volunteers'         ? ChildrensVolunteers
            : p.path === '/childrens/parents'            ? ChildrensParents
            : p.path === '/childrens/forms'              ? ChildrensForms
            : p.path === '/childrens/snacks'             ? ChildrensSnacks
            : p.path === '/childrens/archive'            ? ChildrensArchive
            :                                              ChildrensComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Children's — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Outreach Ministry — same pattern: routes generated from
            outreachConfig.OUTREACH_PAGES, resolved to a real component
            where one exists (ComingSoon kept as the fallback for
            any path not yet wired). */}
        {OUTREACH_PAGES.map(p => {
          const Component =
              p.path === '/outreach/contacts'          ? OutreachContacts
            : p.path === '/outreach/follow-ups'        ? OutreachFollowUps
            : p.path === '/outreach/community-service' ? OutreachCommunityService
            :                                             OutreachComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Outreach — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Women's Ministry — same pattern: routes generated from
            womensConfig.WOMENS_PAGES, resolved to a real component
            where one exists (ComingSoon kept as the fallback for
            any path not yet wired). */}
        {WOMENS_PAGES.map(p => {
          const Component =
              p.path === '/womens/my-involvement' ? WomensMyInvolvement
            : p.path === '/womens/all'            ? WomensAllWomen
            : p.path === '/womens/new'            ? WomensNewToMinistry
            : p.path === '/womens/life-stages'    ? WomensLifeStages
            : p.path === '/womens/bible-studies'  ? WomensBibleStudies
            : p.path === '/womens/mentorship'     ? WomensMentorship
            : p.path === '/womens/prayer-groups'  ? WomensPrayerGroups
            : p.path === '/womens/brunches'       ? WomensBrunchesAndTeas
            : p.path === '/womens/retreats'       ? WomensRetreats
            : p.path === '/womens/conferences'    ? WomensConferences
            : p.path === '/womens/fellowship'     ? WomensFellowship
            : p.path === '/womens/meal-train'     ? WomensMealTrain
            : p.path === '/womens/new-moms'       ? WomensNewMomSupport
            : p.path === '/womens/crisis'         ? WomensCrisis
            : p.path === '/womens/support-groups' ? WomensSupportGroups
            : p.path === '/womens/referrals'      ? WomensReferralDirectory
            : p.path === '/womens/resources'      ? WomensResourceLibrary
            : p.path === '/womens/saved'          ? WomensSavedResources
            : p.path === '/womens/communication'  ? WomensCommunication
            : p.path === '/womens/leaders'        ? WomensLeaders
            : p.path === '/womens/engagement'     ? WomensEngagement
            : p.path === '/womens/stories'        ? WomensStories
            : p.path === '/womens/archive'        ? WomensArchive
            :                                        WomensComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Women's — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Men's Ministry — same pattern: routes generated from
            mensConfig.MENS_PAGES, resolved to a real component where
            one exists (ComingSoon kept as the fallback for any path
            not yet wired). */}
        {MENS_PAGES.map(p => {
          const Component =
              p.path === '/mens/all' ? MensAllMen
            :                           MensComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Men's — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Tech / Production Ministry — same pattern: routes
            generated from techConfig.TECH_PAGES, every page renders
            the shared ComingSoon until its real implementation lands. */}
        {TECH_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Tech — ${p.label}`}><TechComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Missions Ministry — same pattern: routes generated from
            missionsConfig.MISSIONS_PAGES, resolved to a real component
            where one exists (ComingSoon kept as the fallback for any
            path not yet wired). */}
        {MISSIONS_PAGES.map(p => {
          const Component =
              p.path === '/missions/sent-ones'      ? MissionsSentOnes
            : p.path === '/missions/trips/upcoming'  ? MissionsUpcomingTrips
            : p.path === '/missions/prayer/requests' ? MissionsPrayerRequests
            : p.path === '/missions/field/updates'   ? MissionsFieldUpdates
            :                                           MissionsComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Missions — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Hospitality Ministry — same pattern: routes generated
            from hospitalityConfig.HOSPITALITY_PAGES, resolved to a
            real component where one exists (ComingSoon kept as the
            fallback for any path not yet wired). */}
        {HOSPITALITY_PAGES.map(p => {
          const Component =
              p.path === '/hospitality'        ? HospitalityOverview
            : p.path === '/hospitality/all'    ? HospitalityAllHosts
            : p.path === '/hospitality/roles'  ? HospitalityRolesAndPositions
            : p.path === '/hospitality/training' ? HospitalityInTraining
            : p.path === '/hospitality/sunday/parking' ? HospitalityParkingLot
            : p.path === '/hospitality/sunday/greeters' ? HospitalityGreeters
            : p.path === '/hospitality/sunday/welcome-center' ? HospitalityWelcomeCenter
            : p.path === '/hospitality/sunday/ushers' ? HospitalityUshers
            : p.path === '/hospitality/sunday/offering' ? HospitalityOffering
            : p.path === '/hospitality/guests/gifts' ? HospitalityGifts
            : p.path === '/hospitality/guests/follow-up' ? HospitalityFollowUpPipeline
            : p.path === '/hospitality/guests/connect' ? HospitalityConnectEvents
            : p.path === '/hospitality/food/coffee' ? HospitalityCoffee
            : p.path === '/hospitality/food/meals' ? HospitalityMeals
            : p.path === '/hospitality/food/catering' ? HospitalityCatering
            : p.path === '/hospitality/events/weddings' ? HospitalityWeddings
            : p.path === '/hospitality/events/funerals' ? HospitalityFunerals
            : p.path === '/hospitality/events/holiday' ? HospitalityHoliday
            : p.path === '/hospitality/ops/scheduling' ? HospitalityScheduling
            : p.path === '/hospitality/ops/pre-service' ? HospitalityPreService
            : p.path === '/hospitality/ops/setup' ? HospitalitySetup
            : p.path === '/hospitality/ops/communication' ? HospitalityCommunication
            : p.path === '/hospitality/records/engagement' ? HospitalityEngagement
            : p.path === '/hospitality/records/stories' ? HospitalityStories
            : p.path === '/hospitality/records/archive' ? HospitalityArchive
            :                                  HospitalityComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Hospitality — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Discipleship Ministry — same pattern: routes generated
            from discipleshipConfig.DISCIPLESHIP_PAGES, every page
            renders the shared ComingSoon until its real
            implementation lands. */}
        {DISCIPLESHIP_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Discipleship — ${p.label}`}><DiscipleshipComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Administration Ministry — same pattern: routes
            generated from administrationConfig.ADMINISTRATION_PAGES,
            every page renders the shared ComingSoon until its
            real implementation lands. */}
        {ADMINISTRATION_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Administration — ${p.label}`}><AdministrationComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Business / Entrepreneur Ministry — unlike every other
            ministry here, this one is NOT a singleton: a member can
            run several businesses at once, so every real page lives
            under a :businessId (see businessConfig.js). "/business"
            itself is the switcher (BusinessOverview, no shell), and
            every group page route is a template string generated
            from BUSINESS_GROUP_PAGES that React Router matches
            directly against ":businessId". */}
        <Route
          path={BUSINESS_OVERVIEW.path}
          element={<ErrorBoundary pageName="Business — My Businesses"><BusinessOverview /></ErrorBoundary>}
        />
        {BUSINESS_GROUP_PAGES.map(p => {
          const Component = p.path === '/business/:businessId/catalog' ? BusinessProductCatalog
            : p.path === '/business/:businessId/pricing' ? BusinessProductPricing
            : p.path === '/business/:businessId/orders' ? BusinessOrders
            : p.path === '/business/:businessId/invoices' ? BusinessInvoices
            : p.path === '/business/:businessId/customers' ? BusinessCustomers
            : p.path === '/business/:businessId/inventory' ? BusinessInventory
            : p.path === '/business/:businessId/demand' ? BusinessDemand
            : BusinessComingSoon;
          return (
            <Route
              key={p.path}
              path={p.path}
              element={<ErrorBoundary pageName={`Business — ${p.label}`}><Component /></ErrorBoundary>}
            />
          );
        })}
        {/* Pastoral / Teaching Ministry — same pattern: routes
            generated from pastoralConfig.PASTORAL_PAGES, every
            page renders the shared ComingSoon until its real
            implementation lands. */}
        {PASTORAL_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Pastoral — ${p.label}`}><PastoralComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Author Ministry — same pattern: routes generated from
            authorConfig.AUTHOR_PAGES, every page renders the
            shared ComingSoon until its real implementation lands. */}
        {AUTHOR_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Author — ${p.label}`}><AuthorComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Social Media Ministry — same pattern: routes generated
            from socialMediaConfig.SOCIAL_MEDIA_PAGES, every page
            renders the shared ComingSoon until its real
            implementation lands. */}
        {SOCIAL_MEDIA_PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={<ErrorBoundary pageName={`Social Media — ${p.label}`}><SocialMediaComingSoon /></ErrorBoundary>}
          />
        ))}
        {/* Catch-all: unknown URL → bounce back to the home route (Calendar) so we never blank the UI */}
        <Route path="*"                  element={<Navigate to={homeRoute} replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
