/* Content for the Library page's in-app "How-To Guide" (Page
   Settings → How-To Guide tab). Drives both the on-screen JSX render
   and the downloadable Word doc — see client/src/lib/guideText.js
   and client/src/lib/downloadGuideDocx.js. Mirrors
   docs/LIBRARY_HOW_TO_USE.docx. Keep this as the single source of
   truth for the guide's wording; edit here, not inline in JSX. */

export const LIBRARY_GUIDE = {
  title: '❓ How-To Guide — Library',
  feedback:
    '**Something not working?** Go to **Settings → Feedback & Requests** and ' +
    'click **+ New Request** to submit a bug report — it goes straight to the Founder.',
  intro:
    "A full walkthrough of the Library page — your Books and Bible Studies sticky-note " +
    "board. Skim the headers below or read start to finish.",
  sections: [
    {
      h: '📚 Adding a Book or Bible Study',
      blocks: [
        { p: "**New Book** and **New Bible Study** in the toolbar drop a new sticky note onto the board near your current scroll position and open it straight into **Edit mode** so you can start filling it in right away." },
      ],
    },
    {
      h: '📌 Working with Sticky Notes',
      blocks: [
        { p: "Notes behave like real sticky notes on a corkboard:" },
        { list: [
          "**Drag** a note anywhere to move it — alignment guides snap it to nearby notes, groups, and folders as you go.",
          "**Resize** by dragging the handle in a note's bottom-right corner.",
          "**Double-click** a note to open the full editor.",
          "**Drag an image file** onto a Book note to set its cover.",
        ] },
        { p: "Hover a note to reveal quick actions: **🔍 Open**, **🗂 File into a series**, **🎨 Recolor**, **⧉ Duplicate**, **📌 Pin** (locks it in place), and **🗑 Delete**." },
        { p: "Right on the note itself: click the **status pill** to cycle its status (finishing a book or completing a study triggers a confetti celebration), click a **star** to rate a book 1–5, and use the **−, +1, +10 page buttons** to log reading progress once a total page count is set." },
      ],
    },
    {
      h: '📖 Book Notes',
      blocks: [
        { list: [
          "**Overview** — author, category, status, rating, cover image, reading progress, and start/finish dates.",
          "**Notes** — a Markdown area for thoughts, takeaways, and summaries.",
          "**Quotes** — a separate Markdown area for favorite quotes and page numbers.",
          "**Chapters** — one sub-tab per chapter, each with its own notes; add, rename, or delete chapters freely.",
        ] },
      ],
    },
    {
      h: '📘 Bible Study Notes',
      blocks: [
        { list: [
          "**Overview** — book/passage, leader or source, and status.",
          "**Passages** — key verses, one per line; also launches the memory-verse flashcards.",
          "**Questions** and **Reflections** — Markdown areas for discussion questions and personal reflection.",
          "**Sessions** — a dated log of each sitting or week of the study.",
          "**Links** — cross-references plus a checklist to connect this study to any other note as a related note.",
        ] },
      ],
    },
    {
      h: '✝ Scripture Tools',
      blocks: [
        { p: "Anywhere you type Bible text, recognized references (e.g. \"Romans 8:28\") turn into clickable chips linking to BibleGateway (ESV). Click the **📥** button next to a chip to auto-fetch its verse text (World English Bible). On a Bible Study's Passages tab, click **🎴 Memory-verse flashcards** to turn each line into a flip card for memorization practice." },
      ],
    },
    {
      h: '🗂 Organizing Your Board',
      blocks: [
        { list: [
          "**Groups** — a labeled rectangle you drag notes into to cluster them visually; delete a group and its notes stay put.",
          "**Series (folders)** — a movable card you drag notes onto to file them; click its header to drill into a dedicated sub-board for that series, with a \"← All notes\" button to return. Deleting a series returns its notes to the main board.",
          "**Tidy Board** — snaps loose (unpinned, ungrouped) notes into a clean grid.",
          "**Mini-map** — click anywhere on it to jump the board to that spot.",
        ] },
      ],
    },
    {
      h: '🎯 Your Reading Goal',
      blocks: [
        { p: "The toolbar's reading-goal tracker counts books marked Finished this calendar year against a target you set — type a new number into the field at any time. Reaching your goal triggers a one-time confetti celebration." },
      ],
    },
    {
      h: '🛠 Troubleshooting',
      blocks: [
        { list: [
          "**\"The board looks empty.\"** — check whether you're inside a series; click \"← All notes\" to return to the main board.",
          "**\"I can't drag a note.\"** — it's likely pinned; click 📌 in its hover toolbar to unpin it.",
          "**\"My cover image didn't upload.\"** — only image files can be dropped, and only onto Book notes; you can also paste a direct image URL into the Cover field.",
          "**\"Changes don't seem to be saving.\"** — everything autosaves shortly after you stop typing or dragging; make sure you're signed in and online.",
        ] },
      ],
    },
  ],
};
