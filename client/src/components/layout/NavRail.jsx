import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isFounder } from '../../lib/founder';
import { useUserProfile } from '../../lib/userProfile';
import { CustomAvatar } from '../../pages/friends/Avatar';
import { useUserStoreKey } from '../../lib/userStore';
import { useTotalChatUnread } from '../../lib/chatUnread';
import { usePendingScheduleRequests } from '../../lib/scheduleRequests';
import { useDueReminders } from '../../lib/reminders';
import { useJournalNotifications } from '../../lib/journalNotifications';
import { usePrayerNotifications } from '../../lib/prayerNotifications';
import { useFriendsNotifications } from '../../lib/friendsNotifications';
import { useContactsNotifications } from '../../lib/contactsNotifications';
import { NAV_VISIBILITY_STORAGE_KEY, isCategoryVisible } from '../../pages/settings/navVisibilityConfig';
import { YOUTH_OVERVIEW, YOUTH_GROUPS, YOUTH_PATHS } from '../../pages/youth/youthConfig';
import { CHILDRENS_OVERVIEW, CHILDRENS_GROUPS, CHILDRENS_PATHS } from '../../pages/childrens/childrensConfig';
import { OUTREACH_OVERVIEW, OUTREACH_GROUPS, OUTREACH_PATHS } from '../../pages/outreach/outreachConfig';
import { WOMENS_OVERVIEW, WOMENS_MY_INVOLVEMENT, WOMENS_RESOURCE_LIBRARY, WOMENS_GROUPS, WOMENS_PATHS } from '../../pages/womens/womensConfig';
import { WORSHIP_OVERVIEW } from '../../pages/worship/worshipConfig';
import { MENS_OVERVIEW, MENS_GROUPS, MENS_PATHS } from '../../pages/mens/mensConfig';
import { TECH_OVERVIEW, TECH_GROUPS, TECH_PATHS } from '../../pages/tech/techConfig';
import { MISSIONS_OVERVIEW, MISSIONS_GROUPS, MISSIONS_PATHS } from '../../pages/missions/missionsConfig';
import { HOSPITALITY_OVERVIEW, HOSPITALITY_GROUPS, HOSPITALITY_PATHS } from '../../pages/hospitality/hospitalityConfig';
import { WEBSITE_OVERVIEW } from '../../pages/website/websiteConfig';
import { BLOG_OVERVIEW } from '../../pages/blog/blogConfig';
import { DISCIPLESHIP_OVERVIEW, DISCIPLESHIP_GROUPS, DISCIPLESHIP_PATHS } from '../../pages/discipleship/discipleshipConfig';
import { ADMINISTRATION_OVERVIEW, ADMINISTRATION_GROUPS, ADMINISTRATION_PATHS } from '../../pages/administration/administrationConfig';
import { PASTORAL_OVERVIEW, PASTORAL_GROUPS, PASTORAL_PATHS } from '../../pages/pastoral/pastoralConfig';
import { AUTHOR_OVERVIEW, AUTHOR_GROUPS, AUTHOR_PATHS } from '../../pages/author/authorConfig';
import { SOCIAL_MEDIA_OVERVIEW, SOCIAL_MEDIA_GROUPS, SOCIAL_MEDIA_PATHS } from '../../pages/socialmedia/socialMediaConfig';
import { BUSINESS_OVERVIEW } from '../../pages/business/businessConfig';
import { isDetached, canDetach } from '../../lib/detached';
import './NavRail.css';

/* ─────────────────────────────────────────────────────────────
   Navigation sidebar — icon + label, collapsible groups.

   Structure:
     Standalone (Journal, Prayers, Friends, Calendar, Chat, Testimony)
     [...ministry sections...]
     Settings  (pinned to bottom — always visible, never filtered)

     Per-user category visibility: each top-level section is
     toggled on/off via Settings. See navVisibilityConfig.js.
     ── Worship Ministry  ▾
        ── Recording / Production  ▾
           Studio  (path: /multitrack)  |  Stems Library  |  Mix Notes  |  Scheduling Rec.
           ── Instruments  ▾
              Piano  |  Drums  |  Seaboard  |  AKAI MPC
        ── Song Management  ▾
           Songs  |  Themes  |  CCLI Log  |  Chord Charts
        ── Live Worship / Events  ▾
           Setlist  |  Service Builder  |  Lyrics Display  |  Countdown
        ── Band / Team  ▾
           Roster  |  Scheduling  |  Subs  |  Onboarding
        ── Gear / Tech  ▾
           Inventory  |  Maintenance Log  |  Stage Plot  |  Tech Issues
        ── Admin  ▾
           Budget  |  Documents  |  Meetings  |  Backup & Export
     Website Ministry  ▾
        ── Inventory & Standards  ▾
           Page Audit  |  Forms Tracker  |  Tech Stack  |  Style Guide
        ── Maintenance & Health  ▾
           Update Log  |  Broken Links & Issues  |  SEO Health
        ── Operations  ▾
           Hosting & Domain  |  Visitor Feedback
     Blog Ministry  ▾
        ── Content  ▾
           Posts Library  |  Content Ideas  |  Quotes Library  |  Categories & Series
        ── Engagement & Announcements  ▾
           Comments Moderation  |  Newsletter Issues  |  Post Performance  |  Authors / Contributors
     Youth Ministry  ▾
        Overview
        ── Students  ▾  All Students  |  Bible Studies  |  Visitors
        ── Events    ▾  Weekly Nights  |  Trips & Retreats  |  Outreach
        ── Teaching  ▾  Lessons & Series  |  Games & Icebreakers
        ── Team      ▾  Leaders  |  Parent Communication
        ── Records   ▾  Forms & Permissions  |  Archive
     Children's Ministry  ▾
        Overview
        ── Kids               ▾  All Kids  |  Age Groups  |  Allergies & Medical
        ── Check-In & Safety  ▾  Check-In Station  |  Pickup Authorization  |  Incident Reports  |  Background Checks
        ── Programs           ▾  Sunday Mornings  |  Midweek / Clubs  |  VBS & Special Events
        ── Curriculum         ▾  Lessons & Series  |  Crafts & Activities  |  Take-Home Sheets
        ── Team               ▾  Volunteers  |  Parent Communication
        ── Records            ▾  Registration Forms  |  Snacks & Supplies  |  Archive
     Outreach Ministry  ▾
        Overview
        ── Initiatives    ▾  Community Service  |  Evangelism  |  Community Events  |  Prayer Walks
        ── People Reached ▾  New Contacts  |  Follow-Ups  |  Connection Tracker
        ── Partners       ▾  Local Organizations  |  Sister Churches  |  Sponsors & Donors
        ── Resources      ▾  Tracts & Literature  |  Supplies & Donations  |  Budget & Giving
        ── Team           ▾  Volunteers  |  Scheduling
        ── Records        ▾  Impact Reports  |  Stories & Testimonies  |  Archive
     Women's Ministry  ▾
        Overview
        ── Members       ▾  All Women  |  Life Stages  |  New to Ministry
        ── Discipleship  ▾  Bible Studies  |  Mentorship Pairs  |  Prayer Groups
        ── Events        ▾  Retreats  |  Brunches & Teas  |  Conferences  |  Fellowship & Crafts
        ── Care          ▾  Meal Train  |  New Mom Support  |  Crisis & Counseling
        ── Team          ▾  Leaders  |  Communication
        ── Records       ▾  Engagement & Attendance  |  Stories & Testimonies  |  Archive
     Men's Ministry  ▾
        Overview
        ── Members             ▾  All Men  |  Life Stages  |  New to Ministry
        ── Discipleship        ▾  Bible Studies  |  Mentorship Pairs  |  Accountability Groups  |  Prayer Breakfast
        ── Events & Fellowship ▾  Retreats  |  BBQs & Cookouts  |  Conferences  |  Sports & Outdoors
        ── Service             ▾  Work Days  |  Helping Hands
        ── Family & Calling    ▾  Father-Son  |  Marriage Support  |  Work & Calling
        ── Team                ▾  Leaders  |  Communication
        ── Records             ▾  Engagement & Attendance  |  Stories & Testimonies  |  Archive
     Tech / Production  ▾
        Overview
        ── Team        ▾  All Techs  |  Roles & Positions  |  In Training
        ── Audio       ▾  FOH Mixing  |  Monitor Mixes  |  Mic Plot
        ── Video       ▾  Cameras  |  Switcher / Direction  |  Graphics
        ── Lighting    ▾  Console & Cues  |  Color Palettes & Looks  |  Stage Wash & Spots
        ── Streaming   ▾  Live Stream  |  Recordings & Archive  |  Online Chat / Comments
        ── Operations  ▾  Service Plans  |  Pre-Service Checklist  |  Scheduling
        ── Gear & IT   ▾  Inventory  |  Maintenance Log  |  Tech Issues  |  Network & Cabling
        ── Records     ▾  Reliability & Issues  |  Wins & Highlights  |  Archive
     Missions Ministry  ▾
        Overview
        ── Missionaries  ▾  Our Sent Ones  |  Supported Partners  |  Sending Pipeline  |  Missionary Care
        ── Mission Trips ▾  Upcoming Trips  |  Past Trips  |  Application & Approval  |  Training & Prep
        ── Field         ▾  Regions & Countries  |  People Groups  |  Partner Agencies  |  Field Updates
        ── Prayer        ▾  Prayer Requests  |  Prayer Calendar
        ── Giving        ▾  Missions Budget  |  Designated Giving  |  Annual Faith Promise
        ── Engagement    ▾  Missions Education  |  Missions Sunday & Conferences  |  Stories from the Field
        ── Team          ▾  Missions Committee  |  Communication
        ── Records       ▾  Stats & History  |  Testimonies  |  Archive
     Hospitality Ministry  ▾
        Overview
        ── Team               ▾  All Hosts  |  Roles & Positions  |  In Training
        ── Sunday Hosting     ▾  Parking Lot  |  Greeters  |  Welcome Center  |  Ushers & Seating  |  Offering & Communion
        ── New Guests         ▾  First-Time Visitor Gifts  |  Follow-Up Pipeline  |  Newcomer Connect Events
        ── Food & Refreshments▾  Coffee & Snacks  |  Member / Community Meals  |  Event Catering
        ── Special Events     ▾  Weddings  |  Funerals  |  Holiday Hosting
        ── Operations         ▾  Scheduling  |  Pre-Service Checklist  |  Setup & Decor  |  Communication
        ── Records            ▾  Engagement & Attendance  |  Stories & Photos  |  Archive
     Discipleship Ministry  ▾
        Overview
        ── Disciple's Path     ▾  New Believer Steps  |  Baptism  |  Membership  |  Next Steps Pathway
        ── Bible Engagement    ▾  Adult Bible Studies  |  Bible Reading Plans  |  Sermon-Based Studies
        ── Community Groups    ▾  Group Directory  |  Group Finder  |  Group Leaders
        ── Mentorship          ▾  Mentor / Mentee Pairs  |  Mentor Training  |  Pairing Requests
        ── Equipping           ▾  Class Catalog  |  Class Schedule  |  Spiritual Gifts  |  Spiritual Disciplines
        ── Leadership Pipeline ▾  Aspiring Leaders  |  Pipeline Stages  |  Leadership Training
        ── Team                ▾  Pastors & Coaches  |  Communication
        ── Records             ▾  Engagement & Progress  |  Stories & Testimonies  |  Archive
     Administration  ▾
        Overview
        ── Staff & HR         ▾  Staff Directory  |  Payroll & Benefits  |  Hiring & Onboarding  |  Reviews & Evaluations
        ── Finance            ▾  Giving & Donations  |  Expenses & Reimbursements  |  Budget  |  Annual Audit & Reports
        ── Governance         ▾  Elders / Board  |  Meeting Minutes  |  Bylaws & Policies  |  Votes & Decisions
        ── Facilities         ▾  Building Overview  |  Maintenance & Repairs  |  Custodial  |  Keys & Access
        ── Legal & Compliance ▾  501(c)(3) & Tax-Exempt  |  Insurance  |  Contracts  |  Risk Management
        ── Member Database    ▾  All Members  |  Life Events  |  Pastoral Care Notes
        ── Office             ▾  Mass Communications  |  Master Calendar  |  Supplies & Reception
        ── Records            ▾  Reports & Stats  |  Document Archive  |  Archive
     Pastoral / Teaching  ▾  (centerpiece: Sermon Workshop + Reusable Notes for write-now-pull-later)
        Overview
        ── Sermon Workshop      ▾  New Sermon  |  My Drafts  |  Sermon Library  |  Reuse / Adapt
        ── Reusable Notes       ▾  Note Snippets  |  Illustrations & Stories  |  Quotes Library  |  Scripture Notes  |  Commentaries & References
        ── Series & Themes      ▾  Current Series  |  Series Ideas  |  Sermon Themes / Tags
        ── Schedule & Delivery  ▾  Preaching Calendar  |  Guest Speakers  |  Service Notes  |  Audio / Video Archive
        ── Pastoral Care        ▾  Visits Log  |  Counseling Sessions  |  Weddings  |  Funerals  |  Crisis & Urgent
        ── Team                 ▾  Pastors  |  Communication
        ── Records              ▾  Themes & Frequency  |  Stories & Testimonies  |  Archive
     Author Ministry  ▾  (centerpiece: capture ideas/notes + Book Workshop + Devotional Workshop)
        Overview
        ── Ideas & Inspiration   ▾  Book Ideas  |  Idea Journal  |  Quote & Reference Vault  |  Reading List
        ── Book Workshop         ▾  New Book  |  Manuscripts  |  Chapters & Outlines  |  Drafts & Revisions  |  Published Library
        ── Devotional Workshop   ▾  New Devotional  |  Devotional Series  |  Devotional Library  |  Publishing Calendar
        ── Research & Notes      ▾  Research Notes  |  Themes & Motifs  |  Characters & People  |  Settings & Places
        ── Publishing & Audience ▾  Submissions & Pitches  |  Publishing Pipeline  |  Reader Feedback  |  Sales & Royalties
        ── Team                  ▾  Editors & Collaborators  |  Communication
        ── Records               ▾  Writing Stats  |  Stories & Testimonies  |  Archive
     Social Media Ministry  ▾
        Overview
        ── Content Studio       ▾  New Post  |  Drafts  |  Content Library  |  Sermon Clips  |  Content Ideas
        ── Calendar & Campaigns ▾  Content Calendar  |  Scheduled Posts  |  Campaigns & Launches  |  Recurring Series
        ── Platforms            ▾  Instagram  |  Facebook  |  TikTok  |  YouTube  |  X / Twitter
        ── Brand & Assets       ▾  Brand Guidelines  |  Image & Video Library  |  Templates & Quote Cards
        ── Engagement           ▾  Comments Inbox  |  DMs Inbox  |  Flags & Moderation  |  Community Highlights
        ── Analytics & Ads      ▾  Performance Dashboard  |  Growth Trends  |  Top Content  |  Ad Campaigns
        ── Team                 ▾  Social Media Team  |  Communication
        ── Records              ▾  Stats & History  |  Stories & Testimonies  |  Archive
   ───────────────────────────────────────────────────────────── */

/* `vid` is the visibility id used by Settings + the visibility
   map. Must match the ids in pages/settings/navVisibilityConfig.js. */
const STANDALONE = [
  { vid: 'journal',      path: '/journal',      icon: '📖', label: 'Journal',     color: 'var(--tab-journal)'  },
  { vid: 'prayers',      path: '/prayers',      icon: '🙏', label: 'Prayers',     color: 'var(--tab-prayers)'  },
  { vid: 'friends',      path: '/friends',      icon: '👥', label: 'Friends',     color: 'var(--tab-friends)'  },
  { vid: 'contacts',     path: '/contacts',     icon: '🔎', label: 'Contacts',    color: 'var(--tab-contacts)' },
  { vid: 'calendar',     path: '/calendar',     icon: '📅', label: 'Calendar',    color: 'var(--accent-amber)' },
  { vid: 'day-planner',  path: '/day-planner',  icon: '🕐', label: 'Day Planner', color: '#f59e0b'             },
  { vid: 'chat',         path: '/chat',         icon: '💬', label: 'Chat',        color: '#60a5fa'             },
  { vid: 'testimony',    path: '/testimony',    icon: '🙌', label: 'Testimony',   color: '#f59e0b'             },
  { vid: 'writing',      path: '/writing',      icon: '✍️', label: 'Writing Mode', color: '#7dd3fc'            },
  { vid: 'library',      path: '/library',      icon: '📚', label: 'Library',     color: '#fcd34d'             },
];

/* These three are mandatory — always shown in the rail regardless of
   the user's stored visibility preference, and intentionally absent
   from NAV_STANDALONE_CATEGORIES so they never appear as a toggle in
   Settings or as a question in the FirstRunWizard onboarding flow. */
const ALWAYS_VISIBLE_STANDALONE = new Set(['contacts', 'calendar', 'chat']);

/* ── Podcast Ministry ─────────────────────────────────────── */
const PODCAST_STUDIO = [
  { path: '/podcast-studio',      icon: '🎥', label: 'Studio',     color: 'var(--accent-rose)'   },
  { path: '/podcast-recordings',  icon: '🎞', label: 'Recordings', color: 'var(--accent-amber)'  },
  { path: '/podcast-editor',      icon: '✂',  label: 'Editor',     color: 'var(--accent-teal)'   },
  { path: '/podcast-scenes',      icon: '🎬', label: 'Scenes',     color: 'var(--accent-purple)' },
];

/* Soon placeholders */
const PODCAST_CONTENT_SOON = [
  { label: 'Episodes Library',         icon: '📰' },
  { label: 'Episode Ideas',            icon: '💡' },
  { label: 'Guests',                   icon: '🎤' },
  { label: 'Pull Quotes / Audiograms', icon: '❝'  },
];
const PODCAST_PRODUCTION_SOON = [
  { label: 'Recording Sessions',  icon: '📅' },
  { label: 'Production Checklist',icon: '✅' },
  { label: 'Music & SFX Library', icon: '🎵' },
];
const PODCAST_DISTRIBUTION_SOON = [
  { label: 'Platforms & Feeds', icon: '📡' },
  { label: 'Transcripts',       icon: '📝' },
];
const PODCAST_ANALYTICS_SOON = [
  { label: 'Download Stats',   icon: '📈' },
  { label: 'Listener Feedback',icon: '💬' },
];

const PODCAST_STUDIO_PATHS = PODCAST_STUDIO.map(n => n.path);
const PODCAST_PATHS = [...PODCAST_STUDIO_PATHS];

/* ── Youth Ministry ───────────────────────────────────────── */
/* Per-subgroup path arrays, keyed by group.key, used to decide
   which subgroup should be auto-opened when navigating into it. */
const YOUTH_GROUP_PATHS = YOUTH_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Children's Ministry ──────────────────────────────────── */
const CHILDRENS_GROUP_PATHS = CHILDRENS_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Outreach Ministry ────────────────────────────────────── */
const OUTREACH_GROUP_PATHS = OUTREACH_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Women's Ministry ─────────────────────────────────────── */
const WOMENS_GROUP_PATHS = WOMENS_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Men's Ministry ───────────────────────────────────────── */
const MENS_GROUP_PATHS = MENS_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Tech / Production Ministry ───────────────────────────── */
const TECH_GROUP_PATHS = TECH_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Missions Ministry ────────────────────────────────────── */
const MISSIONS_GROUP_PATHS = MISSIONS_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Hospitality Ministry ─────────────────────────────────── */
const HOSPITALITY_GROUP_PATHS = HOSPITALITY_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Discipleship Ministry ────────────────────────────────── */
const DISCIPLESHIP_GROUP_PATHS = DISCIPLESHIP_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Administration Ministry ──────────────────────────────── */
const ADMINISTRATION_GROUP_PATHS = ADMINISTRATION_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Pastoral / Teaching Ministry ─────────────────────────── */
const PASTORAL_GROUP_PATHS = PASTORAL_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Author Ministry ──────────────────────────────────────── */
const AUTHOR_GROUP_PATHS = AUTHOR_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

/* ── Social Media Ministry ────────────────────────────────── */
const SOCIAL_MEDIA_GROUP_PATHS = SOCIAL_MEDIA_GROUPS.reduce((acc, g) => {
  acc[g.key] = g.items.map(i => i.path);
  return acc;
}, {});

export default function NavRail() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { profile } = useUserProfile();

  /* ── Drawer open state ──
        The rail is hidden by default; a floating ☰ trigger at the
        top-left opens it. State is owned right here so every page
        gets the slide-out behavior automatically just by rendering
        `<NavRail />` somewhere in its tree. */
  const [railOpen, setRailOpen] = useState(false);
  const openRail  = () => setRailOpen(true);
  const closeRail = () => setRailOpen(false);

  /* ── Drag-to-detach ──
        Nav items are draggable (Electron only). Dragging one out of
        the rail — releasing it to the right of the panel or off the
        window — pops that page into its own sidebar-less window, the
        same as the ⧉ button. `dragging` drives the on-screen hint. */
  const [dragging, setDragging] = useState(false);

  const handleItemDragStart = (e, path) => {
    if (!canDetach()) return;
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  const handleItemDragEnd = (e, path, withShell) => {
    setDragging(false);
    if (!canDetach()) return;
    const rect = document.querySelector('.nav-rail')?.getBoundingClientRect();
    /* Released onto the page (right of the rail) OR off the window
       entirely (Chromium reports 0,0 for an out-of-window drop). */
    const offWindow = e.clientX <= 0 && e.clientY <= 0;
    const pastRail  = rect ? e.clientX > rect.right : true;
    if (offWindow || pastRail) {
      /* Dragging a whole ministry category (e.g. Women's/Hospitality
         Ministry) keeps that ministry's own bespoke shell nav in the
         pop-out; a single leaf page pops out bare. */
      window.electronAPI?.openDetached?.(path, withShell ? { withShell: true } : undefined);
      setRailOpen(false);
    }
  };

  /* ── Routes currently popped out into their own windows ──
        The main process broadcasts this list; we hide those items from
        the rail since the page now lives in its own window. `mergeZone`
        lights up the left-edge drop target while a pop-out is dragged
        back toward the menu. */
  const [detachedRoutes, setDetachedRoutes] = useState([]);
  const [mergeZone, setMergeZone] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onDetachedRoutes) return;
    const offRoutes = window.electronAPI.onDetachedRoutes(routes => setDetachedRoutes(routes || []));
    const offZone   = window.electronAPI.onMergeZone?.(show => setMergeZone(!!show));
    // Pull the current list in case we mounted after a pop-out opened.
    window.electronAPI.requestDetachedRoutes?.();
    return () => { offRoutes?.(); offZone?.(); };
  }, []);

  /* Esc closes the drawer + auto-close when the path changes (so
     clicking a nav item navigates AND tucks the drawer back, no
     manual dismiss needed). */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setRailOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setRailOpen(false); }, [pathname]);

  /* External pages can dispatch `nav-rail-toggle` on the window to
     open the rail from their own topbar buttons (e.g. a hamburger
     in the page topbar). */
  useEffect(() => {
    const onToggle = () => setRailOpen(v => !v);
    window.addEventListener('nav-rail-toggle', onToggle);
    return () => window.removeEventListener('nav-rail-toggle', onToggle);
  }, []);

  /* Total unread chat messages across all my channels — used to
     render a notification badge in the top-right corner of the
     Chat nav item. Returns 0 if no user / no unreads. */
  const chatUnread = useTotalChatUnread();

  /* Pending recording-session requests addressed to me — used to
     render the same notification badge on the Calendar tab. Plus
     any due reminders from Calendar events (Bible Studies etc.). */
  const scheduleRequests = usePendingScheduleRequests();
  const dueReminders     = useDueReminders();
  const calendarUnread   = scheduleRequests.length + dueReminders.length;

  /* Journal notifications — same hook the Journal bell uses, so the
     side-rail badge stays in sync with the in-page bell. */
  const { notifications: journalNotifs } = useJournalNotifications();
  const journalNotifCount = journalNotifs.length;

  /* Prayer notifications — same shared hook the Prayers page bell
     uses, so the rail badge matches the bell badge exactly. Sources:
     today's prayer reminder + long-standing prayer alerts. */
  const { notifications: prayerNotifs } = usePrayerNotifications();
  const prayerNotifCount = prayerNotifs.length;

  /* Friend notifications — same reach-out + birthday signals the
     Friends page activity bell surfaces, so the rail badge matches. */
  const { notifications: friendsNotifs } = useFriendsNotifications();
  const friendsNotifCount = friendsNotifs.length;

  /* Contacts notifications — incoming connection requests + new
     (not-yet-viewed) accepted connections, same source the Contacts
     page's own "My Contacts" tab badge reads from. */
  const { badgeCount: contactsNotifCount } = useContactsNotifications();

  /* Per-user category visibility map — read from Firestore via
     useUserStoreKey. Missing entries default to visible (the
     isCategoryVisible helper handles that), so newly added
     ministries appear by default until the user hides them. */
  const [navVisibility] = useUserStoreKey(NAV_VISIBILITY_STORAGE_KEY, {});
  const showCat = (id) => isCategoryVisible(navVisibility, id);
  /* Pre-filtered standalone list — keeps the render below tidy.
     Calendar, Chat, and Contacts are mandatory: always shown
     regardless of stored preference, and no longer offered as a
     choice in Settings or the FirstRunWizard onboarding step
     (they were removed from NAV_STANDALONE_CATEGORIES for that
     reason — see navVisibilityConfig.js). */
  const visibleStandalone = STANDALONE.filter(
    item => ALWAYS_VISIBLE_STANDALONE.has(item.vid) || showCat(item.vid)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  /* Initials for the avatar — first letter of first two words, fallback to '?'. */
  const initials = (user?.displayName || user?.email || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase() || '?';

  const inPodcast         = PODCAST_PATHS.some(p => pathname.startsWith(p));
  const inPodcastStudio   = PODCAST_STUDIO_PATHS.some(p => pathname.startsWith(p));
  const inYouth           = YOUTH_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Youth subgroup currently active?" booleans. */
  const inYouthGroup = YOUTH_GROUPS.reduce((acc, g) => {
    acc[g.key] = YOUTH_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inChildrens       = CHILDRENS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Children's subgroup currently active?" booleans. */
  const inChildrensGroup = CHILDRENS_GROUPS.reduce((acc, g) => {
    acc[g.key] = CHILDRENS_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inOutreach        = OUTREACH_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Outreach subgroup currently active?" booleans. */
  const inOutreachGroup = OUTREACH_GROUPS.reduce((acc, g) => {
    acc[g.key] = OUTREACH_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inWomens          = WOMENS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Women's subgroup currently active?" booleans. */
  const inWomensGroup = WOMENS_GROUPS.reduce((acc, g) => {
    acc[g.key] = WOMENS_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inMens            = MENS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Men's subgroup currently active?" booleans. */
  const inMensGroup = MENS_GROUPS.reduce((acc, g) => {
    acc[g.key] = MENS_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inTech            = TECH_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Tech subgroup currently active?" booleans. */
  const inTechGroup = TECH_GROUPS.reduce((acc, g) => {
    acc[g.key] = TECH_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inMissions        = MISSIONS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Missions subgroup currently active?" booleans. */
  const inMissionsGroup = MISSIONS_GROUPS.reduce((acc, g) => {
    acc[g.key] = MISSIONS_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inHospitality     = HOSPITALITY_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Hospitality subgroup currently active?" booleans. */
  const inHospitalityGroup = HOSPITALITY_GROUPS.reduce((acc, g) => {
    acc[g.key] = HOSPITALITY_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inDiscipleship    = DISCIPLESHIP_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Discipleship subgroup currently active?" booleans. */
  const inDiscipleshipGroup = DISCIPLESHIP_GROUPS.reduce((acc, g) => {
    acc[g.key] = DISCIPLESHIP_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inAdministration  = ADMINISTRATION_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Administration subgroup currently active?" booleans. */
  const inAdministrationGroup = ADMINISTRATION_GROUPS.reduce((acc, g) => {
    acc[g.key] = ADMINISTRATION_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inPastoral        = PASTORAL_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Pastoral subgroup currently active?" booleans. */
  const inPastoralGroup = PASTORAL_GROUPS.reduce((acc, g) => {
    acc[g.key] = PASTORAL_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inAuthor          = AUTHOR_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Author subgroup currently active?" booleans. */
  const inAuthorGroup = AUTHOR_GROUPS.reduce((acc, g) => {
    acc[g.key] = AUTHOR_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});
  const inSocialMedia     = SOCIAL_MEDIA_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  /* Map of "is this Social Media subgroup currently active?" booleans. */
  const inSocialMediaGroup = SOCIAL_MEDIA_GROUPS.reduce((acc, g) => {
    acc[g.key] = SOCIAL_MEDIA_GROUP_PATHS[g.key].some(p => pathname === p || pathname.startsWith(`${p}/`));
    return acc;
  }, {});

  const [podcastOpen,            setPodcastOpen]            = useState(inPodcast);
  const [podcastStudioOpen,      setPodcastStudioOpen]      = useState(inPodcastStudio);
  const [podcastContentOpen,     setPodcastContentOpen]     = useState(false);
  const [podcastProductionOpen,  setPodcastProductionOpen]  = useState(false);
  const [podcastDistributionOpen,setPodcastDistributionOpen]= useState(false);
  const [podcastAnalyticsOpen,   setPodcastAnalyticsOpen]   = useState(false);
  const [youthOpen,              setYouthOpen]              = useState(inYouth);
  /* One open/closed flag per Youth subgroup, keyed by group.key. */
  const [youthGroupsOpen, setYouthGroupsOpen] = useState(() =>
    YOUTH_GROUPS.reduce((acc, g) => {
      acc[g.key] = inYouthGroup[g.key];
      return acc;
    }, {})
  );
  const [childrensOpen,          setChildrensOpen]          = useState(inChildrens);
  /* One open/closed flag per Children's subgroup, keyed by group.key. */
  const [childrensGroupsOpen, setChildrensGroupsOpen] = useState(() =>
    CHILDRENS_GROUPS.reduce((acc, g) => {
      acc[g.key] = inChildrensGroup[g.key];
      return acc;
    }, {})
  );
  const [outreachOpen,           setOutreachOpen]           = useState(inOutreach);
  /* One open/closed flag per Outreach subgroup, keyed by group.key. */
  const [outreachGroupsOpen, setOutreachGroupsOpen] = useState(() =>
    OUTREACH_GROUPS.reduce((acc, g) => {
      acc[g.key] = inOutreachGroup[g.key];
      return acc;
    }, {})
  );
  const [womensOpen,             setWomensOpen]             = useState(inWomens);
  /* One open/closed flag per Women's subgroup, keyed by group.key. */
  const [womensGroupsOpen, setWomensGroupsOpen] = useState(() =>
    WOMENS_GROUPS.reduce((acc, g) => {
      acc[g.key] = inWomensGroup[g.key];
      return acc;
    }, {})
  );
  const [mensOpen,               setMensOpen]               = useState(inMens);
  /* One open/closed flag per Men's subgroup, keyed by group.key. */
  const [mensGroupsOpen, setMensGroupsOpen] = useState(() =>
    MENS_GROUPS.reduce((acc, g) => {
      acc[g.key] = inMensGroup[g.key];
      return acc;
    }, {})
  );
  const [techOpen,               setTechOpen]               = useState(inTech);
  /* One open/closed flag per Tech subgroup, keyed by group.key. */
  const [techGroupsOpen, setTechGroupsOpen] = useState(() =>
    TECH_GROUPS.reduce((acc, g) => {
      acc[g.key] = inTechGroup[g.key];
      return acc;
    }, {})
  );
  const [missionsOpen,           setMissionsOpen]           = useState(inMissions);
  /* One open/closed flag per Missions subgroup, keyed by group.key. */
  const [missionsGroupsOpen, setMissionsGroupsOpen] = useState(() =>
    MISSIONS_GROUPS.reduce((acc, g) => {
      acc[g.key] = inMissionsGroup[g.key];
      return acc;
    }, {})
  );
  const [hospitalityOpen,        setHospitalityOpen]        = useState(inHospitality);
  /* One open/closed flag per Hospitality subgroup, keyed by group.key. */
  const [hospitalityGroupsOpen, setHospitalityGroupsOpen] = useState(() =>
    HOSPITALITY_GROUPS.reduce((acc, g) => {
      acc[g.key] = inHospitalityGroup[g.key];
      return acc;
    }, {})
  );
  const [discipleshipOpen,       setDiscipleshipOpen]       = useState(inDiscipleship);
  /* One open/closed flag per Discipleship subgroup, keyed by group.key. */
  const [discipleshipGroupsOpen, setDiscipleshipGroupsOpen] = useState(() =>
    DISCIPLESHIP_GROUPS.reduce((acc, g) => {
      acc[g.key] = inDiscipleshipGroup[g.key];
      return acc;
    }, {})
  );
  const [administrationOpen,     setAdministrationOpen]     = useState(inAdministration);
  /* One open/closed flag per Administration subgroup, keyed by group.key. */
  const [administrationGroupsOpen, setAdministrationGroupsOpen] = useState(() =>
    ADMINISTRATION_GROUPS.reduce((acc, g) => {
      acc[g.key] = inAdministrationGroup[g.key];
      return acc;
    }, {})
  );
  const [pastoralOpen,           setPastoralOpen]           = useState(inPastoral);
  /* One open/closed flag per Pastoral subgroup, keyed by group.key. */
  const [pastoralGroupsOpen, setPastoralGroupsOpen] = useState(() =>
    PASTORAL_GROUPS.reduce((acc, g) => {
      acc[g.key] = inPastoralGroup[g.key];
      return acc;
    }, {})
  );
  const [authorOpen,             setAuthorOpen]             = useState(inAuthor);
  /* One open/closed flag per Author subgroup, keyed by group.key. */
  const [authorGroupsOpen, setAuthorGroupsOpen] = useState(() =>
    AUTHOR_GROUPS.reduce((acc, g) => {
      acc[g.key] = inAuthorGroup[g.key];
      return acc;
    }, {})
  );
  const [socialMediaOpen,        setSocialMediaOpen]        = useState(inSocialMedia);
  /* One open/closed flag per Social Media subgroup, keyed by group.key. */
  const [socialMediaGroupsOpen, setSocialMediaGroupsOpen] = useState(() =>
    SOCIAL_MEDIA_GROUPS.reduce((acc, g) => {
      acc[g.key] = inSocialMediaGroup[g.key];
      return acc;
    }, {})
  );

  useEffect(() => {
    if (inPodcast)         setPodcastOpen(true);
    if (inPodcastStudio)   setPodcastStudioOpen(true);
    if (inYouth)           setYouthOpen(true);
    /* Auto-open whichever Youth subgroup the active route lives in. */
    setYouthGroupsOpen(prev => {
      const next = { ...prev };
      YOUTH_GROUPS.forEach(g => {
        if (inYouthGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inChildrens)       setChildrensOpen(true);
    /* Auto-open whichever Children's subgroup the active route lives in. */
    setChildrensGroupsOpen(prev => {
      const next = { ...prev };
      CHILDRENS_GROUPS.forEach(g => {
        if (inChildrensGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inOutreach)        setOutreachOpen(true);
    /* Auto-open whichever Outreach subgroup the active route lives in. */
    setOutreachGroupsOpen(prev => {
      const next = { ...prev };
      OUTREACH_GROUPS.forEach(g => {
        if (inOutreachGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inWomens)          setWomensOpen(true);
    /* Auto-open whichever Women's subgroup the active route lives in. */
    setWomensGroupsOpen(prev => {
      const next = { ...prev };
      WOMENS_GROUPS.forEach(g => {
        if (inWomensGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inMens)            setMensOpen(true);
    /* Auto-open whichever Men's subgroup the active route lives in. */
    setMensGroupsOpen(prev => {
      const next = { ...prev };
      MENS_GROUPS.forEach(g => {
        if (inMensGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inTech)            setTechOpen(true);
    /* Auto-open whichever Tech subgroup the active route lives in. */
    setTechGroupsOpen(prev => {
      const next = { ...prev };
      TECH_GROUPS.forEach(g => {
        if (inTechGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inMissions)        setMissionsOpen(true);
    /* Auto-open whichever Missions subgroup the active route lives in. */
    setMissionsGroupsOpen(prev => {
      const next = { ...prev };
      MISSIONS_GROUPS.forEach(g => {
        if (inMissionsGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inHospitality)     setHospitalityOpen(true);
    /* Auto-open whichever Hospitality subgroup the active route lives in. */
    setHospitalityGroupsOpen(prev => {
      const next = { ...prev };
      HOSPITALITY_GROUPS.forEach(g => {
        if (inHospitalityGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inDiscipleship)    setDiscipleshipOpen(true);
    /* Auto-open whichever Discipleship subgroup the active route lives in. */
    setDiscipleshipGroupsOpen(prev => {
      const next = { ...prev };
      DISCIPLESHIP_GROUPS.forEach(g => {
        if (inDiscipleshipGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inAdministration)  setAdministrationOpen(true);
    /* Auto-open whichever Administration subgroup the active route lives in. */
    setAdministrationGroupsOpen(prev => {
      const next = { ...prev };
      ADMINISTRATION_GROUPS.forEach(g => {
        if (inAdministrationGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inPastoral)        setPastoralOpen(true);
    /* Auto-open whichever Pastoral subgroup the active route lives in. */
    setPastoralGroupsOpen(prev => {
      const next = { ...prev };
      PASTORAL_GROUPS.forEach(g => {
        if (inPastoralGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inAuthor)          setAuthorOpen(true);
    /* Auto-open whichever Author subgroup the active route lives in. */
    setAuthorGroupsOpen(prev => {
      const next = { ...prev };
      AUTHOR_GROUPS.forEach(g => {
        if (inAuthorGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
    if (inSocialMedia)     setSocialMediaOpen(true);
    /* Auto-open whichever Social Media subgroup the active route lives in. */
    setSocialMediaGroupsOpen(prev => {
      const next = { ...prev };
      SOCIAL_MEDIA_GROUPS.forEach(g => {
        if (inSocialMediaGroup[g.key]) next[g.key] = true;
      });
      return next;
    });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const NavItem = ({ item, indent = 0, badge = 0 }) => {
    const active = pathname.startsWith(item.path);
    // Hidden while popped out — the page lives in its own window now.
    if (detachedRoutes.includes(item.path)) return null;
    const isDraggable = canDetach() && !item.noDrag;
    return (
      <button
        className={`nr-item ${active ? 'on' : ''} ${isDraggable ? 'draggable' : ''}`}
        style={{ '--tab-color': item.color, paddingLeft: `${12 + indent * 12}px` }}
        onClick={() => navigate(item.path)}
        draggable={isDraggable}
        onDragStart={(e) => handleItemDragStart(e, item.path)}
        onDragEnd={(e) => handleItemDragEnd(e, item.path, item.withShell)}
        title={badge > 0 ? `${item.label} — ${badge} unread` : item.label}
        aria-current={active ? 'page' : undefined}
      >
        {active && <span className="nr-item-bar" />}
        <span className="nr-item-icon">{item.icon}</span>
        <span className="nr-item-label">{item.label}</span>
        {badge > 0 && (
          <span className="nr-item-badge" aria-label={`${badge} unread`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  const GroupHeader = ({ icon, label, open, active, onClick, indent = 0, color }) => {
    /* Tinted ministries get a bold purple block treatment via
       inline styles (highest specificity short of !important).
       Made dramatic on purpose so the change is impossible to
       miss visually. */
    const tintedStyle = color ? {
      color:        '#ffffff',
      background:   '#5b21b6',                              /* solid deep violet */
      borderLeft:   `4px solid ${color}`,
      paddingLeft:  `${12 + indent * 12 + 4}px`,
      boxShadow:    `inset 0 0 12px rgba(167, 139, 250, 0.45), 0 0 8px rgba(167, 139, 250, 0.35)`,
      fontWeight:   800,
    } : {
      paddingLeft:  `${12 + indent * 12}px`,
    };
    return (
      <button
        className={`nr-group ${open ? 'open' : ''} ${active ? 'active' : ''} ${color ? 'tinted' : ''}`}
        style={tintedStyle}
        onClick={onClick}
        aria-expanded={open}
      >
        <span
          className="nr-group-icon"
          style={color ? { filter: `drop-shadow(0 0 8px ${color})`, fontSize: '15px' } : undefined}
        >{icon}</span>
        <span
          className="nr-group-label"
          style={color ? { color: '#ffffff' } : undefined}
        >{label}</span>
        <span
          className="nr-group-chevron"
          style={color ? { color: '#ffffff' } : undefined}
        >{open ? '▾' : '▸'}</span>
      </button>
    );
  };

  /* Colored sub-group header — uses --group-color for tinted hover + active state */
  const SubGroupHeader = ({ icon, label, open, active, onClick, indent = 1, color }) => (
    <button
      className={`nr-subgroup ${open ? 'open' : ''} ${active ? 'active' : ''}`}
      style={{ paddingLeft: `${12 + indent * 12}px`, '--group-color': color }}
      onClick={onClick}
      aria-expanded={open}
    >
      <span className="nr-group-icon">{icon}</span>
      <span className="nr-group-label">{label}</span>
      <span className="nr-group-chevron">{open ? '▾' : '▸'}</span>
    </button>
  );

  /* In a detached pop-out window there's no sidebar — just a single
     "Put back" control that hands this page back to the main window
     and closes the pop-out. */
  if (isDetached()) {
    return (
      <button
        type="button"
        className="nr-putback"
        onClick={() => window.electronAPI?.putBack?.()}
        aria-label="Put page back in main window"
        title="Put back in main window"
      >⤺ Put back</button>
    );
  }

  return (
    <>
      {/* Floating ☰ trigger — opens the drawer. Always visible at
          the top-left of the viewport (hidden while the drawer is
          open so it doesn't clash with the close ✕). */}
      <button
        type="button"
        className={`nr-trigger ${railOpen ? 'is-hidden' : ''}`}
        onClick={openRail}
        aria-label="Open navigation"
        title="Navigation"
      >☰</button>

      {/* Drag-to-detach hint — shown only while a nav item is being
          dragged, so users discover the gesture. */}
      {dragging && (
        <div className="nr-drag-hint" aria-hidden="true">
          ⧉ Drop outside the menu to open in a new window
        </div>
      )}

      {/* Merge drop zone — lit up while a detached window is being
          dragged. Release the window over this left strip to merge the
          page back into the main window. */}
      {mergeZone && (
        <div className="nr-merge-zone" aria-hidden="true">
          <span className="nr-merge-zone-label">⤺ Drop here to merge back</span>
        </div>
      )}

      {/* Dim backdrop — click anywhere outside the rail to close. */}
      <div
        className={`nr-backdrop ${railOpen ? 'is-open' : ''}`}
        onClick={closeRail}
        aria-hidden="true"
      />

      <nav
        className={`nav-rail ${railOpen ? 'is-open' : ''}`}
        aria-label="Main navigation"
      >

      {/* App wordmark */}
      <div className="nr-wordmark">
        <span className="nr-wordmark-cross">✝</span>
        <div className="nr-wordmark-text">
          <span className="nr-wordmark-title">Ministry</span>
          <span className="nr-wordmark-sub">Hub</span>
        </div>
        <button
          type="button"
          className="nr-close"
          onClick={closeRail}
          aria-label="Close navigation"
          title="Close (Esc)"
        >✕</button>
      </div>

      <div className="nr-divider" />

      {/* Standalone items — Chat gets a badge for unread messages,
          Calendar gets one for pending recording-session requests.
          Filtered against the per-user visibility map from Settings. */}
      {visibleStandalone.length > 0 && (
        <>
          <div className="nr-section">
            {visibleStandalone.map(item => {
              const badge =
                item.path === '/chat'     ? chatUnread
              : item.path === '/calendar' ? calendarUnread
              : item.path === '/journal'  ? journalNotifCount
              : item.path === '/prayers'  ? prayerNotifCount
              : item.path === '/friends'  ? friendsNotifCount
              : item.path === '/contacts' ? contactsNotifCount
              :                             0;
              return <NavItem key={item.path} item={item} badge={badge} />;
            })}
          </div>

          <div className="nr-divider" />
        </>
      )}

      {/* Worship Ministry — treated as a single flat page in the
          main sidebar (like Calendar/Chat above), not an expandable
          group. Worship Ministry has its own bespoke shell
          (WorshipShell) with its own internal nav for moving
          between Overview, sub-pages, and groups, so surfacing all
          of that here too was redundant — clicking this just opens
          straight into the Overview page. */}
      {showCat('worship') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  WORSHIP_OVERVIEW.path,
            icon:  '🎶',
            label: 'Worship Ministry',
            color: WORSHIP_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Website Ministry — treated as a single flat page in the main
          sidebar (like Women's/Hospitality above), not an expandable
          group. Website Ministry has its own bespoke shell
          (WebsiteShell) with its own internal nav for moving between
          Overview, sub-pages, and groups, so surfacing all of that
          here too was redundant — clicking this just opens straight
          into the Overview page. */}
      {showCat('website') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  WEBSITE_OVERVIEW.path,
            icon:  '🌐',
            label: 'Website Ministry',
            color: WEBSITE_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Blog Ministry — treated as a single flat page in the main
          sidebar (like Website Ministry above), not an expandable
          group. Blog Ministry has its own bespoke shell (BlogShell)
          with its own internal nav for moving between Overview,
          sub-pages, and groups, so surfacing all of that here too
          was redundant — clicking this just opens straight into the
          Overview page. */}
      {showCat('blog') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  BLOG_OVERVIEW.path,
            icon:  '✍',
            label: 'Blog Ministry',
            color: BLOG_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Podcast Ministry — top-level group */}
      {showCat('podcast') && (
      <div className="nr-section">
        <GroupHeader
          icon="🎙" label="Podcast Ministry"
          open={podcastOpen} active={inPodcast}
          onClick={() => setPodcastOpen(o => !o)}
        />

        {podcastOpen && (
          <div className="nr-group-body">

            {/* ── Recording Studio sub-group (live) ── */}
            <SubGroupHeader
              icon="🎥" label="Recording Studio"
              open={podcastStudioOpen} active={inPodcastStudio}
              onClick={() => setPodcastStudioOpen(o => !o)}
              indent={1}
              color="var(--accent-rose, #fb7185)"
            />
            {podcastStudioOpen && (
              <div className="nr-subgroup-body">
                {PODCAST_STUDIO.map(item => <NavItem key={item.path} item={item} indent={2} />)}
              </div>
            )}

            {/* ── Content sub-group (soon) ── */}
            <SubGroupHeader
              icon="📻" label="Content"
              open={podcastContentOpen} active={false}
              onClick={() => setPodcastContentOpen(o => !o)}
              indent={1}
              color="var(--accent-pink, #f472b6)"
            />
            {podcastContentOpen && (
              <div className="nr-subgroup-body">
                {PODCAST_CONTENT_SOON.map(item => (
                  <div
                    key={item.label}
                    className="nr-item nr-item-soon"
                    style={{ paddingLeft: `${12 + 2 * 12}px` }}
                    title={`${item.label} — coming soon`}
                  >
                    <span className="nr-item-icon">{item.icon}</span>
                    <span className="nr-item-label">{item.label}</span>
                    <span className="nr-soon-badge">soon</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Production sub-group (soon) ── */}
            <SubGroupHeader
              icon="🎚" label="Production"
              open={podcastProductionOpen} active={false}
              onClick={() => setPodcastProductionOpen(o => !o)}
              indent={1}
              color="var(--accent-teal, #2dd4bf)"
            />
            {podcastProductionOpen && (
              <div className="nr-subgroup-body">
                {PODCAST_PRODUCTION_SOON.map(item => (
                  <div
                    key={item.label}
                    className="nr-item nr-item-soon"
                    style={{ paddingLeft: `${12 + 2 * 12}px` }}
                    title={`${item.label} — coming soon`}
                  >
                    <span className="nr-item-icon">{item.icon}</span>
                    <span className="nr-item-label">{item.label}</span>
                    <span className="nr-soon-badge">soon</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Distribution sub-group (soon) ── */}
            <SubGroupHeader
              icon="📡" label="Distribution"
              open={podcastDistributionOpen} active={false}
              onClick={() => setPodcastDistributionOpen(o => !o)}
              indent={1}
              color="var(--accent-purple, #a78bfa)"
            />
            {podcastDistributionOpen && (
              <div className="nr-subgroup-body">
                {PODCAST_DISTRIBUTION_SOON.map(item => (
                  <div
                    key={item.label}
                    className="nr-item nr-item-soon"
                    style={{ paddingLeft: `${12 + 2 * 12}px` }}
                    title={`${item.label} — coming soon`}
                  >
                    <span className="nr-item-icon">{item.icon}</span>
                    <span className="nr-item-label">{item.label}</span>
                    <span className="nr-soon-badge">soon</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Engagement & Analytics sub-group (soon) ── */}
            <SubGroupHeader
              icon="📊" label="Engagement & Analytics"
              open={podcastAnalyticsOpen} active={false}
              onClick={() => setPodcastAnalyticsOpen(o => !o)}
              indent={1}
              color="var(--accent-amber, #fbbf24)"
            />
            {podcastAnalyticsOpen && (
              <div className="nr-subgroup-body">
                {PODCAST_ANALYTICS_SOON.map(item => (
                  <div
                    key={item.label}
                    className="nr-item nr-item-soon"
                    style={{ paddingLeft: `${12 + 2 * 12}px` }}
                    title={`${item.label} — coming soon`}
                  >
                    <span className="nr-item-icon">{item.icon}</span>
                    <span className="nr-item-label">{item.label}</span>
                    <span className="nr-soon-badge">soon</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
      )}

      {/* Youth Ministry — treated as a single flat page in the main
          sidebar (like Calendar/Chat above), not an expandable group.
          Youth Ministry has its own bespoke shell (YouthShell) with
          its own internal nav for moving between Overview, sub-pages,
          and groups, so surfacing all of that here too was redundant —
          clicking this just opens straight into the Overview page. */}
      {showCat('youth') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  YOUTH_OVERVIEW.path,
            icon:  '⚡',
            label: 'Youth Ministry',
            color: YOUTH_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Children's Ministry — treated as a single flat page in the
          main sidebar (like Calendar/Chat above), not an expandable
          group. Children's Ministry has its own bespoke shell
          (ChildrensShell) with its own internal nav for moving
          between Overview, sub-pages, and groups, so surfacing all
          of that here too was redundant — clicking this just opens
          straight into the Overview page. */}
      {showCat('childrens') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  CHILDRENS_OVERVIEW.path,
            icon:  '🧸',
            label: "Children's Ministry",
            color: CHILDRENS_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Outreach Ministry — treated as a single flat page in the main
          sidebar (like Calendar/Chat above), not an expandable group.
          Outreach Ministry has its own bespoke shell (OutreachShell) with
          its own internal nav for moving between Overview, sub-pages,
          and groups, so surfacing all of that here too was redundant —
          clicking this just opens straight into the Overview page. */}
      {showCat('outreach') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  OUTREACH_OVERVIEW.path,
            icon:  '🤲',
            label: 'Outreach Ministry',
            color: OUTREACH_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Women's Ministry — treated as a single flat page in the main
          sidebar (like Calendar/Chat above), not an expandable group.
          Women's Ministry has its own bespoke shell (WomensShell) with
          its own internal nav for moving between Overview, sub-pages,
          and groups, so surfacing all of that here too was redundant —
          clicking this just opens straight into the Overview page. */}
      {showCat('womens') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  WOMENS_OVERVIEW.path,
            icon:  '🌸',
            label: "Women's Ministry",
            color: WOMENS_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Men's Ministry — treated as a single flat page in the main
          sidebar (like Women's above), not an expandable group.
          Men's Ministry has its own bespoke shell (MensShell) with
          its own internal nav for moving between Overview, sub-pages,
          and groups, so surfacing all of that here too was redundant —
          clicking this just opens straight into the Overview page. */}
      {showCat('mens') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  MENS_OVERVIEW.path,
            icon:  '🧭',
            label: "Men's Ministry",
            color: MENS_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Tech / Production Ministry — treated as a single flat page in
          the main sidebar (like Women's/Men's above), not an expandable
          group. Tech / Production has its own bespoke shell (TechShell)
          with its own internal nav for moving between Overview, sub-pages,
          and groups, so surfacing all of that here too was redundant —
          clicking this just opens straight into the Overview page. */}
      {showCat('tech') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  TECH_OVERVIEW.path,
            icon:  '🎬',
            label: 'Tech / Production',
            color: TECH_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Missions Ministry — treated as a single flat page in the
          main sidebar (like Women's/Men's/Tech above), not an
          expandable group. Missions Ministry has its own bespoke
          shell (MissionsShell) with its own internal nav for moving
          between Overview, sub-pages, and groups, so surfacing all
          of that here too was redundant — clicking this just opens
          straight into the Overview page. */}
      {showCat('missions') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  MISSIONS_OVERVIEW.path,
            icon:  '✈️',
            label: 'Missions Ministry',
            color: MISSIONS_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Hospitality Ministry — treated as a single flat page in the
          main sidebar (like Calendar/Chat above), not an expandable
          group. Hospitality Ministry has its own bespoke shell
          (HospitalityShell) with its own internal nav for moving
          between Overview, sub-pages, and groups, so surfacing all
          of that here too was redundant — clicking this just opens
          straight into the Overview page. */}
      {showCat('hospitality') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  HOSPITALITY_OVERVIEW.path,
            icon:  '🤗',
            label: 'Hospitality Ministry',
            color: HOSPITALITY_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Discipleship Ministry — treated as a single flat page in the
          main sidebar (like Women's/Men's/Tech above), not an
          expandable group. Discipleship Ministry has its own bespoke
          shell (DiscipleshipShell) with its own internal nav for
          moving between Overview, sub-pages, and groups, so surfacing
          all of that here too was redundant — clicking this just
          opens straight into the Overview page. */}
      {showCat('discipleship') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  DISCIPLESHIP_OVERVIEW.path,
            icon:  '🌿',
            label: 'Discipleship Ministry',
            color: DISCIPLESHIP_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Administration — treated as a single flat page in the main
          sidebar (like Women's / Outreach / Men's above), not an
          expandable group. Administration has its own bespoke shell
          (AdministrationShell) with its own internal nav for moving
          between Overview, sub-pages, and groups, so surfacing all
          of that here too was redundant — clicking this just opens
          straight into the Overview page. */}
      {showCat('administration') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  ADMINISTRATION_OVERVIEW.path,
            icon:  '🏛',
            label: 'Administration',
            color: ADMINISTRATION_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Business / Entrepreneur — same flat treatment as
          Administration above. Unlike every other bespoke-shell
          ministry, Business isn't a singleton (a member can run
          several businesses at once), so this always opens straight
          into the "My Businesses" switcher rather than one fixed
          Overview page — BusinessShell handles all navigation once
          a business is open. */}
      {showCat('business') && (
      <div className="nr-section">
        <NavItem
          item={{
            path:  BUSINESS_OVERVIEW.path,
            icon:  '🏢',
            label: 'Business / Entrepreneur',
            color: BUSINESS_OVERVIEW.accent,
            withShell: true,
            noDrag: true,
          }}
        />
      </div>
      )}

      {/* Pastoral / Teaching Ministry — top-level group. Every
          sub-page is wired to the shared <PastoralComingSoon />
          component for now. Built around sermon CREATION
          (Sermon Workshop) and REUSABLE NOTES so a pastor can
          write a sermon today and pull from past notes /
          illustrations / quotes / scripture work tomorrow. */}
      {showCat('pastoral') && (
      <div className="nr-section">
        <GroupHeader
          icon="⛪" label="Pastoral / Teaching"
          open={pastoralOpen} active={inPastoral}
          onClick={() => setPastoralOpen(o => !o)}
        />

        {pastoralOpen && (
          <div className="nr-group-body">

            {/* Overview — sits flat under the Pastoral header. */}
            <NavItem
              item={{
                path:  PASTORAL_OVERVIEW.path,
                icon:  PASTORAL_OVERVIEW.icon,
                label: PASTORAL_OVERVIEW.label,
                color: PASTORAL_OVERVIEW.accent,
              }}
              indent={1}
            />

            {PASTORAL_GROUPS.map(group => (
              <div key={group.key}>
                <SubGroupHeader
                  icon={group.icon}
                  label={group.label}
                  open={!!pastoralGroupsOpen[group.key]}
                  active={!!inPastoralGroup[group.key]}
                  onClick={() =>
                    setPastoralGroupsOpen(prev => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }
                  indent={1}
                  color={group.color}
                />
                {pastoralGroupsOpen[group.key] && (
                  <div className="nr-subgroup-body">
                    {group.items.map(item => (
                      <NavItem
                        key={item.path}
                        item={{
                          path:  item.path,
                          icon:  item.icon,
                          label: item.label,
                          color: item.accent,
                        }}
                        indent={2}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

          </div>
        )}
      </div>
      )}

      {/* Author Ministry — top-level group. Every sub-page is
          wired to the shared <AuthorComingSoon /> component for
          now. Built around three things: a place to capture
          book IDEAS, a Book Workshop to WRITE books, and a
          Devotional Workshop to WRITE devotionals. */}
      {showCat('author') && (
      <div className="nr-section">
        <GroupHeader
          icon="🪶" label="Author Ministry"
          open={authorOpen} active={inAuthor}
          onClick={() => setAuthorOpen(o => !o)}
        />

        {authorOpen && (
          <div className="nr-group-body">

            {/* Overview — sits flat under the Author header. */}
            <NavItem
              item={{
                path:  AUTHOR_OVERVIEW.path,
                icon:  AUTHOR_OVERVIEW.icon,
                label: AUTHOR_OVERVIEW.label,
                color: AUTHOR_OVERVIEW.accent,
              }}
              indent={1}
            />

            {AUTHOR_GROUPS.map(group => (
              <div key={group.key}>
                <SubGroupHeader
                  icon={group.icon}
                  label={group.label}
                  open={!!authorGroupsOpen[group.key]}
                  active={!!inAuthorGroup[group.key]}
                  onClick={() =>
                    setAuthorGroupsOpen(prev => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }
                  indent={1}
                  color={group.color}
                />
                {authorGroupsOpen[group.key] && (
                  <div className="nr-subgroup-body">
                    {group.items.map(item => (
                      <NavItem
                        key={item.path}
                        item={{
                          path:  item.path,
                          icon:  item.icon,
                          label: item.label,
                          color: item.accent,
                        }}
                        indent={2}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

          </div>
        )}
      </div>
      )}

      {/* Social Media Ministry — top-level group. Every
          sub-page is wired to the shared
          <SocialMediaComingSoon /> component for now. Built
          around the actual rhythm: Content Studio → Calendar
          → per-platform pages → brand assets → engagement
          inbox → analytics. */}
      {showCat('social-media') && (
      <div className="nr-section">
        <GroupHeader
          icon="📱" label="Social Media Ministry"
          open={socialMediaOpen} active={inSocialMedia}
          onClick={() => setSocialMediaOpen(o => !o)}
        />

        {socialMediaOpen && (
          <div className="nr-group-body">

            {/* Overview — sits flat under the Social Media header. */}
            <NavItem
              item={{
                path:  SOCIAL_MEDIA_OVERVIEW.path,
                icon:  SOCIAL_MEDIA_OVERVIEW.icon,
                label: SOCIAL_MEDIA_OVERVIEW.label,
                color: SOCIAL_MEDIA_OVERVIEW.accent,
              }}
              indent={1}
            />

            {SOCIAL_MEDIA_GROUPS.map(group => (
              <div key={group.key}>
                <SubGroupHeader
                  icon={group.icon}
                  label={group.label}
                  open={!!socialMediaGroupsOpen[group.key]}
                  active={!!inSocialMediaGroup[group.key]}
                  onClick={() =>
                    setSocialMediaGroupsOpen(prev => ({
                      ...prev,
                      [group.key]: !prev[group.key],
                    }))
                  }
                  indent={1}
                  color={group.color}
                />
                {socialMediaGroupsOpen[group.key] && (
                  <div className="nr-subgroup-body">
                    {group.items.map(item => (
                      <NavItem
                        key={item.path}
                        item={{
                          path:  item.path,
                          icon:  item.icon,
                          label: item.label,
                          color: item.accent,
                        }}
                        indent={2}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

          </div>
        )}
      </div>
      )}

      {/* Settings — pinned to the bottom of the rail, ABOVE the
          user footer. Always visible (never filtered by
          visibility map) so users can re-enable any category
          they hid. */}
      <div className="nr-divider" />
      <div className="nr-section">
        <NavItem
          item={{
            path:  '/settings',
            icon:  '⚙',
            label: 'Settings',
            color: 'var(--accent-purple, #a78bfa)',
          }}
        />
        {/* Founder Dashboard — only ever rendered for the one hardcoded
            founder account (see lib/founder.js). Everyone else never
            sees this link; the /founder route + Firestore rules also
            block access even if someone finds the URL. */}
        {isFounder(user) && (
          <NavItem
            item={{
              path:  '/founder',
              icon:  '🛡',
              label: 'Founder Dashboard',
              color: 'var(--accent-amber, #f59e0b)',
            }}
          />
        )}
      </div>

      {/* ─── Signed-in user footer ─── */}
      {user && (
        <div className="nr-user">
          <div
            className={`nr-user-avatar${profile?.avatar ? ' has-img' : ''}`}
            style={profile?.avatar ? undefined : { background: 'var(--accent-purple, #a78bfa)' }}
            aria-hidden="true"
          >
            {profile?.avatar ? <CustomAvatar avatar={profile.avatar} /> : initials}
          </div>
          <div className="nr-user-info">
            <div className="nr-user-name" title={user.displayName}>{user.displayName}</div>
            <div className="nr-user-email" title={user.email}>{user.email}</div>
          </div>
          <button
            type="button"
            className="nr-user-logout"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            ⎋
          </button>
        </div>
      )}

      </nav>
    </>
  );
}
