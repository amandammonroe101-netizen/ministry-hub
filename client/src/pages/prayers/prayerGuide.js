/* Content for the Prayers page's in-app "How to Use" guide (Page
   Settings → How to Use tab). Drives both the on-screen JSX render
   and the downloadable Word doc — see client/src/lib/guideText.js
   and client/src/lib/downloadGuideDocx.js. Mirrors
   docs/PRAYERS_HOW_TO_USE.md. Keep this as the single source of
   truth for the guide's wording; edit here, not inline in JSX. */

export const PRAYER_GUIDE = {
  title: '❓ How to Use the Prayers Page',
  feedback:
    '**Something not working?** Go to **Settings → Feedback & Requests** and ' +
    'click **+ New Request** to submit a bug report — it goes straight to the Founder.',
  intro:
    "A full walkthrough of everything on this page — tracking prayer requests and praise, " +
    "working through them with Pray Now, and linking the people you're praying for. Skim " +
    "the headers below or read start to finish.",
  sections: [
    {
      h: '🏠 The Dashboard',
      blocks: [
        { list: [
          "**🙏 Pray Now banner** — launches a guided walkthrough of what needs prayer right now.",
          "**Today's Focus** — up to 6 urgent and daily-list prayers; click a row to open it.",
          "**Stats Row** — Total, Answered, Urgent, Daily, Praise, and 30+ days — each tile jumps to the Board pre-filtered.",
          "**Answer Rate** — percentage of prayers marked answered (toggle in Display tab).",
          "**Recent Testimonies** — up to 4 recently answered prayers.",
          "**Carrying Longest** — up to 3 of your oldest still-open prayers.",
          "**Category Bars** — distribution of prayers across categories (toggle in Display tab).",
          "**Encouragement Verse** — a scripture verse you choose, auto-looked-up (set in Display tab).",
        ] },
      ],
    },
    {
      h: '📋 The Board (Kanban)',
      blocks: [
        { p: "Switch to **📋 Board** in the topbar to see every prayer as a draggable card across three columns: **🙏 Praying**, **✓ Answered**, and **✨ Praise**. Drag a card between columns to change its status instantly, or click a card to open its full detail view. Urgent prayers float to the top of the Praying column automatically." },
      ],
    },
    {
      h: '✦ Adding a Prayer or Praise',
      blocks: [
        { p: "Click **✦ New Prayer** in the topbar. Choose a kind (🙏 Praying / ✓ Answered / ✨ Praise — Praise simplifies the form), then fill in a title, body, optional scripture references, a category, and the **🔥 Urgent** / **📆 Daily** flags. You can also toggle on any Friends you're praying for, right from the form." },
      ],
    },
    {
      h: '🔍 The Prayer Detail View',
      blocks: [
        { p: "Click any prayer card to open its detail modal, with five tabs:" },
        { list: [
          "**📖 Prayer** — the request text, scripture, category, and status controls.",
          "**🙏 Updates** — a running timeline; type a reflection and press ⌘+Enter (or click + Add Update) to post.",
          "**👥 Praying For** — manage which Friends are linked (see below).",
          "**📊 Insights** — days on the wall, total updates, days since last update, and updates per week, with a contextual tip.",
        ] },
      ],
    },
    {
      h: '🙏 Pray Now (Guided Session)',
      blocks: [
        { p: "The Pray Now banner walks you through up to 12 prayers in order: urgent first, then daily-list, then your 3 oldest, then up to 3 praise entries (saved for last). For each one you can jot an optional reflection, mark it answered, skip it, or bail out to the Board. Finishing shows a completion screen with the option to pray through the list again." },
      ],
    },
    {
      h: '👥 Linking Friends to a Prayer',
      blocks: [
        { p: "From the **Praying For** tab (or the New/Edit form), attach any of your saved Friends to a prayer. The link is bidirectional — the same prayer shows up under that friend's Prayer Requests tab on the Friends page, with a button to jump back here." },
      ],
    },
    {
      h: '📖 Scripture References',
      blocks: [
        { p: "Type a reference (e.g. Romans 8:28-39) and press Enter or click + Add. The verse text is auto-fetched after a short pause. If the reference can't be found, you'll see a message but the reference is still saved without resolved text." },
      ],
    },
    {
      h: '🔔 Reminders & Notifications',
      blocks: [
        { p: "Set a daily prayer nudge in the **Reminders** tab above — pick days and, if you like, sync it to your Calendar page. The bell icon in the topbar surfaces both that reminder and **⏳ long-standing alerts** for prayers that have been open past your configured threshold (default 30 days, adjustable in the Integrations tab)." },
      ],
    },
    {
      h: '📋 Page Settings — Full Reference',
      blocks: [
        { list: [
          "**🔔 Reminders** — daily prayer reminder, days, and calendar sync.",
          "**🎨 Display** — landing view, sort order, card density, Dashboard cards, and the Encouragement Verse.",
          "**🗂 Categories** — add or remove custom categories beyond the built-in list.",
          "**🔗 Integrations** — journal linking, Day Planner, and notification behavior.",
          "**📦 Archived** — every answered prayer, with re-open or delete.",
          "**💾 Data** — export format and a one-click download of all prayers.",
        ] },
      ],
    },
    {
      h: '🛠 Troubleshooting',
      blocks: [
        { list: [
          "**\"Couldn't find that reference…\"** — the Bible lookup failed; the reference itself is still saved.",
          "**\"Delete this prayer? This cannot be undone.\"** — confirmation shown before permanent deletion.",
          "Save button stays disabled — both title and body are required.",
        ] },
      ],
    },
  ],
};
