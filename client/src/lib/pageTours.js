/* pageTours — step content for the first-time-user SpotlightTour on
   each standalone page (Journal, Prayers, Friends, Contacts,
   Calendar, Chat, Day Planner, Testimony, Writing, Library).

   Each page marks up to three real elements with a `data-tour`
   attribute so the tour can point at them:
     data-tour="tour-topbar"          the page's topbar/toolbar
     data-tour="tour-primary-action"  its main "add/create" button
     data-tour="tour-settings"        the profile avatar → Page
                                       Settings → How to Use tab,
                                       which holds the full guide

   Not every page has a single obvious "primary action" (e.g.
   Contacts, Testimony) — those pages' step lists just omit that
   selector and go straight from topbar to settings. */

const TOPBAR   = '[data-tour="tour-topbar"]';
const PRIMARY  = '[data-tour="tour-primary-action"]';
const SETTINGS = '[data-tour="tour-settings"]';

const settingsStep = (page) => ({
  selector: SETTINGS,
  title: '❓ Full guide, anytime',
  body: `Open this menu and go to Page Settings → How to Use for the complete ${page} guide — you can also download it as a Word doc.`,
});

export const PAGE_TOURS = {
  journal: [
    { selector: TOPBAR, title: 'Welcome to Journal', body: "This is your space to write reflections, track scripture, and build a writing rhythm over time." },
    { selector: PRIMARY, title: '✦ New Entry', body: 'Start writing anytime. Prompts, visual themes, and scripture references are all built into the editor.' },
    settingsStep('Journal'),
  ],
  prayers: [
    { selector: TOPBAR, title: 'Welcome to Prayers', body: 'Track prayer requests and praises, and pray through them one at a time with Pray Now.' },
    { selector: PRIMARY, title: '✦ New Prayer', body: 'Log a request or an answered prayer — add scripture, a category, and mark it urgent or daily.' },
    settingsStep('Prayers'),
  ],
  friends: [
    { selector: TOPBAR, title: 'Welcome to Friends', body: 'Your directory of people — stay on top of reach-outs, birthdays, and what’s going on in their lives.' },
    { selector: PRIMARY, title: '✦ Add Friend', body: 'Add someone to your directory with a reach-out schedule, or use Quick Add for just a name.' },
    settingsStep('Friends'),
  ],
  contacts: [
    { selector: TOPBAR, title: 'Welcome to Contacts', body: 'Find other Ministry Hub users and connect with them to share prayers and stay in touch.' },
    settingsStep('Contacts'),
  ],
  calendar: [
    { selector: TOPBAR, title: 'Welcome to Calendar', body: 'Every event across the hub — reach-outs, birthdays, reminders, and more — lives here in one place.' },
    { selector: PRIMARY, title: '✦ New Event', body: 'Add anything to your calendar, or just double-click a day to create an event there.' },
    settingsStep('Calendar'),
  ],
  chat: [
    { selector: TOPBAR, title: 'Welcome to Chat', body: 'Message your team in channels or direct messages.' },
    { selector: PRIMARY, title: '+ New channel', body: 'Start a new conversation with your team — give it a name and an optional description.' },
    settingsStep('Chat'),
  ],
  dayPlanner: [
    { selector: TOPBAR, title: 'Welcome to Day Planner', body: 'Plan your day block by block, and sync it with your Calendar.' },
    { selector: PRIMARY, title: '✦ New Block', body: 'Add a task or time block to today — drag to reorder or resize once it’s on the schedule.' },
    settingsStep('Day Planner'),
  ],
  testimony: [
    { selector: TOPBAR, title: 'Welcome to Testimony', body: 'Capture and share what God is doing in your life, in writing or by voice recording.' },
    settingsStep('Testimony'),
  ],
  writing: [
    { selector: TOPBAR, title: 'Welcome to Writing Mode', body: 'A distraction-free space for long-form writing — books, blog drafts, sermons, whatever you’re working on.' },
    { selector: PRIMARY, title: '+ New document', body: 'Start a new document, or organize your writing into folders and series.' },
    settingsStep('Writing Mode'),
  ],
  library: [
    { selector: TOPBAR, title: 'Welcome to Library', body: 'A sticky-note board for tracking the books and Bible studies you’re working through.' },
    { selector: PRIMARY, title: 'New Book / Study', body: 'Add a book or Bible study to the board, then drag it anywhere and double-click to open it.' },
    settingsStep('Library'),
  ],
};
