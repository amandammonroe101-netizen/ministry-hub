/* Content for the Journal page's in-app "How to Use" guide (Page
   Settings → How to Use tab). Drives both the on-screen JSX render
   and the downloadable Word doc — see client/src/lib/guideText.js
   and client/src/lib/downloadGuideDocx.js. Mirrors
   docs/JOURNAL_HOW_TO_USE.md. Keep this as the single source of
   truth for the guide's wording; edit here, not inline in JSX. */

export const JOURNAL_GUIDE = {
  title: '❓ How to Use the Journal Page',
  feedback:
    '**Something not working?** Go to **Settings → Feedback & Requests** and ' +
    'click **+ New Request** to submit a bug report — it goes straight to the Founder.',
  intro:
    "A full walkthrough of everything on this page — writing entries, tracking your " +
    "rhythm, memorizing scripture, and locking things down. Skim the headers below or " +
    "read start to finish.",
  sections: [
    {
      h: '🏠 The Dashboard',
      blocks: [
        { p: "Opening Journal lands you on the Dashboard — a snapshot of your writing habits. Every card can be shown or hidden in the **Display** tab above." },
        { list: [
          "**Today's Reflection Prompt** — a rotating prompt with a \"Write Today's Entry\" button.",
          "**Goals Progress** — bars tracking your daily/weekly entry targets, with a vacation-mode badge when applicable.",
          "**Entry Stats** — total entries, entries in the last 7 days, whether you've written today, and books referenced.",
          "**Writing Rhythm** — a 30-day heatmap; darker squares are days you journaled.",
          "**Entry Length Over Time** — a bar chart of word counts across your last 20 entries.",
          "**Themes & Words** — a word cloud built from your most common words.",
          "**Scripture Coverage** — which Bible books you've referenced, with counts.",
          "**On This Day** — past entries written on this same date in previous years.",
          "**Memory Verse** — your current verse, with memorization progress and controls.",
        ] },
      ],
    },
    {
      h: '✏️ Writing an Entry',
      blocks: [
        { p: 'Click **✦ New Entry** in the sidebar, or "Write Today\'s Entry" on the Dashboard.' },
        { list: [
          "**Prompt banner** — Use Prompt to keep it, Don't Use to dismiss it, or 🔀 New to swap it out.",
          "**Theme picker** — 16 visual themes; the editor's background live-previews your pick.",
          "**Title & Body** — both required to save. Body supports light markdown if enabled in Editor settings: bold, italic, code, and headings.",
          "**Word count bar** — appears only if you've set a word-count goal; turns green once you hit it.",
          "**Scripture References** — see below.",
          "**Linked Prayers** — appears only if prayer linking is enabled (Integrations tab above).",
          "**Lock toggle** — 🔓/🔒 sets a code just for this entry.",
        ] },
        { p: "Drafts auto-save to your browser every 600ms (if enabled in Editor settings) and restore automatically if you navigate away before saving." },
      ],
    },
    {
      h: '👁 Viewing an Entry',
      blocks: [
        { p: 'Click any entry in the sidebar to open it full-page. From there you can **Edit**, **Download** as .txt, **Delete**, go **Full Screen** (press Esc to exit), or head **Dashboard**.' },
      ],
    },
    {
      h: '📚 The Entry List (Sidebar)',
      blocks: [
        { list: [
          "**Search** — matches title and body text in real time.",
          "**Date range filter** — narrow the list to a specific window.",
          "**Sort order & card style** — set in the Display tab (newest/oldest/longest; comfy/compact/title-only).",
          "Locked entries show a 🔒 icon; if \"hide locked previews\" is on, their title is replaced with Locked entry.",
          "Click the › chevron to collapse the sidebar for more room.",
        ] },
      ],
    },
    {
      h: '📖 Scripture References',
      blocks: [
        { p: "Type a reference (e.g. John 3:16) into the Scripture field in the editor. After a short pause the verse text auto-fetches (translation set in Editor settings). Press Enter or click Add to save it — add as many verses as you like, each collapsible and removable. If the lookup fails you'll see \"Couldn't load the verse text,\" but the reference is still saved." },
      ],
    },
    {
      h: '🔗 Linking Prayers to Entries',
      blocks: [
        { p: "Off by default — turn it on in the **Integrations** tab above. Once enabled, a Prayer picker appears in the entry editor. Linked prayers show as removable chips in the editor and as clickable chips in the viewer, jumping to the Prayers page." },
      ],
    },
    {
      h: '🔒 Locking Entries & Privacy',
      blocks: [
        { list: [
          "**Per-entry lock** — click 🔓 Unlocked in the editor to set a code just for that entry.",
          "**Master lock** — set in the **Privacy** tab; gates the whole page and re-locks after a chosen idle period.",
          "**Default lock code** — pre-fills a code so you don't retype it for every new locked entry.",
          "**Hide locked previews** / **exclude locked from search** — extra privacy toggles, also in Privacy.",
          "Forgot your master code? The lock screen has a \"Forgot code? Disable lock\" escape hatch (confirmation required).",
        ] },
      ],
    },
    {
      h: '🧠 Memory Verses & Spaced Repetition',
      blocks: [
        { p: "The Memory Verse card on the Dashboard lets you set a verse (auto-fetched), expand or collapse it, mark it memorized (archives it and clears review reminders), schedule spaced-repetition reviews on a calendar grid, archive it, or delete it. Past verses live in the **Archived** and **Memorized** tabs above, where you can restore or permanently delete them. You can also schedule a recurring \"Pick New Verse\" reminder in the **Reminders** tab." },
      ],
    },
    {
      h: '🔔 Reminders',
      blocks: [
        { p: "Click the bell icon in the topbar, or use the **Reminders** tab above. Set a time, an optional label, and which days it applies to (with Weekdays / Weekends / Daily presets). Reminders can sync to your Calendar page and are cleaned up automatically if you delete them." },
      ],
    },
    {
      h: '📋 Page Settings — Full Reference',
      blocks: [
        { list: [
          "**🔔 Reminders** — journal reminders and the recurring \"Pick New Verse\" schedule.",
          "**🔒 Privacy** — lock codes, auto-lock timing, locked-entry visibility.",
          "**✏️ Writing** — reflection prompts, categories, custom prompts, and daily/weekly goals.",
          "**🎨 Display** — which Dashboard cards show, sort order, card density, date format.",
          "**🔗 Integrations** — turn prayer linking on/off.",
          "**📦 Archived** / **✓ Memorized** — manage past memory verses.",
          "**💾 Data** — export, import, and clear-all-data tools.",
        ] },
      ],
    },
    {
      h: '💾 Export, Import & Clearing Data',
      blocks: [
        { p: "In the **Data** tab: export everything as .txt, .md, or .json (optionally including images), import entries you've exported before, or clear all data entirely. Clearing cannot be undone — export first if there's any chance you'll want the entries again." },
      ],
    },
    {
      h: '🛠 Troubleshooting',
      blocks: [
        { list: [
          "**\"Your journal storage is full…\"** — export your entries, then clear old ones.",
          "**\"Couldn't reach Firestore…\"** — you're offline; try again once connected.",
          "**\"You're signed out…\"** — your session expired; sign back in.",
          "**\"Incorrect code.\"** — wrong entry or master lock code.",
          "**\"Couldn't load the verse text…\"** — the Bible lookup failed; the reference is still saved.",
        ] },
      ],
    },
  ],
};
