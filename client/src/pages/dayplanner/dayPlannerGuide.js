/* Content for the Day Planner page's in-app "How to Use" guide (Page
   Settings → How to Use tab). Drives the downloadable Word doc — see
   client/src/lib/guideText.js and client/src/lib/downloadGuideDocx.js.
   Mirrors docs/DAY_PLANNER_HOW_TO_USE.md and the hand-written JSX in
   DayPlannerPageSettings.jsx. Keep all three in sync if the guide
   changes — edit the wording here AND in the JSX below it. */

export const DAY_PLANNER_GUIDE = {
  title: '❓ How to Use the Day Planner',
  feedback:
    '**Something not working?** Go to **Settings → Feedback & Requests** and ' +
    'click **+ New Request** to submit a bug report — it goes straight to the Founder Dashboard.',
  intro:
    "A full walkthrough of everything on this page — time-blocking your day on the hourly " +
    "grid, tracking priorities and energy levels, recurring blocks, templates, and syncing " +
    "your day to the Calendar. Skim the headers below or read start to finish.",
  sections: [
    {
      h: '🗺 Layout Overview',
      blocks: [
        { list: [
          "**Header** — date controls, the pretty-printed date, stats row, and the day theme.",
          "**Week strip** — a 7-day overview with a density bar per day; click any day to jump to it.",
          "**Left column** — Rest Guardrail, Focus Mix, Prayer Focus, Reach Out, Top Priorities, and Day Notes.",
          "**Center column** — the main timeline (or Split/Week view).",
          "**Right column** — Recurring Blocks, a Categories reference, and Templates.",
          "**Topbar** — Today, ‹ / › (previous/next day), 📅 Sync, ✦ New Block, and your profile avatar.",
        ] },
      ],
    },
    {
      h: '🧭 Navigating Between Days',
      blocks: [
        { p: "Move between days from the topbar (**Today**, **‹**, **›**), the header (**◀**, **Today**, **▶**, or the date picker), the week strip (click any day), or by clicking a day's mini-header in Split or Week view. The current date is reflected in the URL, so refreshing keeps you on the same day." },
      ],
    },
    {
      h: '✦ Creating a Time Block',
      blocks: [
        { list: [
          "**✦ New Block** — adds a 1-hour block at the current time, rounded to the nearest 15 minutes.",
          "**Double-click an empty hour** on the timeline — adds a 1-hour block starting there.",
          "**＋ [X]h free** — fills an open gap once you have at least one block that day.",
          "**Quick-add chips** — 🙏 Pray (30m), 🧠 Focus (90m), 🌿 Rest (60m) appear in larger gaps.",
        ] },
      ],
    },
    {
      h: '✏ Editing, Moving, and Resizing a Block',
      blocks: [
        { p: "**Double-click a block** to open its editor — title, start/end time, category, focus level, notes, and an optional **🔔 Remind me via the bell** toggle, plus **🗑 Delete** and **🔁 Make recurring**. **Drag the block body** up or down to move it (snaps to 15 minutes). **Drag the bottom edge** to resize it (minimum 15 minutes). Overlapping blocks automatically lay out side-by-side." },
      ],
    },
    {
      h: '✓ Completing and Deleting Blocks',
      blocks: [
        { p: "Click the checkbox at the start of a block to mark it done — done blocks are muted and don't count as free time. Click the **×** on a block (or **🗑 Delete** in the editor) to remove it; a synced Calendar event is removed with it. Deleting a recurring instance only dismisses that day — the rule still fires on other matching days." },
      ],
    },
    {
      h: '🎨 Categories and Focus Levels',
      blocks: [
        { p: "Every block has one **category** (Prayer, Bible Study, Ministry, Meeting, Work, Family, Meals, Rest, Travel, Exercise, Outreach, Personal, Other — each color-coded, see the Categories card in the right sidebar), and can optionally carry a **focus level**: 🧠 Deep focus, 🗂️ Admin, or 🌿 Light. Untagged blocks show up in their own bucket on the Focus Mix chart." },
      ],
    },
    {
      h: '⭐ Top Priorities',
      blocks: [
        { p: "The **⭐ Top priorities** card (left sidebar) tracks a few key things for the day, separately from blocks. Click **＋ Add** to create one, double-click to edit its text, check it off when done, or click **×** to remove it. The header stats row shows a running \"X/Y priorities done\" count." },
      ],
    },
    {
      h: '🔁 Recurring Blocks',
      blocks: [
        { p: "In the **🔁 Recurring blocks** card (right sidebar), click **＋ Add** to build a rule from scratch, or open any block's editor and click **🔁 Make recurring** to turn it into one. Choose which weekday(s) and how often — every day, weekdays, weekly, every 2 weeks, or monthly (same week-of-month). Click **×** next to a rule to delete it everywhere it appears, not just today." },
      ],
    },
    {
      h: '🧩 Templates',
      blocks: [
        { p: "The **🧩 Templates** card (right sidebar) offers three built-in presets — 📖 Sermon Prep Day, 🤝 Visitation Day, and 🕊️ Sabbath / Rest Day — plus any you save yourself with **💾 Save today**. Click a template's name to apply it (with a confirmation, since it replaces today's blocks and priorities — your notes are kept). Your own saved templates can be deleted with the **×** next to them." },
      ],
    },
    {
      h: '📅 Syncing to Calendar',
      blocks: [
        { p: "The **📅 Sync** button marks the whole day as planned on your Calendar with a single \"🗓 Day Is Planned\" event — it needs at least one block first. Per-block reminders (**🔔 Remind me via the bell**) are separate and fire independently of whether you've synced the day." },
      ],
    },
    {
      h: '🗓 View Modes: Day, Split, Week',
      blocks: [
        { list: [
          "**Day** — the default single-day hourly timeline.",
          "**Split** — today and tomorrow side-by-side, handy for planning tomorrow in the evening.",
          "**Week** — all 7 days as mini columns, with a summary of total hours, days with rest, and packed days.",
        ] },
      ],
    },
    {
      h: '🧰 Toolbar Extras',
      blocks: [
        { list: [
          "**📋 Copy** — copies a plain-text agenda of the day to your clipboard.",
          "**🖨 Print** — opens a clean, print-friendly agenda (works for printing to PDF too).",
          "**↪ Roll over** — walks through unfinished blocks one at a time, offering to move each to tomorrow.",
        ] },
      ],
    },
    {
      h: '🛟 Sidebar Panels',
      blocks: [
        { list: [
          "**🛟 Guardrail** — a gentle nudge if the day is overloaded (14+ hours) or has no rest blocked out.",
          "**🧠 Focus Mix** — a stacked bar chart of your Deep/Admin/Light hours for the day.",
          "**🙏 Prayer Focus** — a handful of prayers to work through today (only shown if Prayers is enabled); use the –/+ stepper to change how many show.",
          "**Reach Out** — friend reach-out reminders (only shown if Friends is enabled).",
        ] },
      ],
    },
    {
      h: '🛠 Troubleshooting',
      blocks: [
        { list: [
          "**\"No blocks to sync — add some first.\"** — add at least one block before clicking Sync.",
          "**\"Could not mark the day — please try again.\"** — the Calendar sync request failed; check your connection and retry.",
          "**\"Could not copy — clipboard blocked.\"** — your browser blocked clipboard access for the Copy button.",
          "**\"Nothing to roll over — every block is checked off. 🎉\"** — Roll Over found no unfinished blocks to move.",
        ] },
      ],
    },
  ],
};
