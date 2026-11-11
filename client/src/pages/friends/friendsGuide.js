/* Content for the Friends page's in-app "How to Use" guide (Page
   Settings → How to Use tab). Drives both the on-screen JSX render
   and the downloadable Word doc — see client/src/lib/guideText.js
   and client/src/lib/downloadGuideDocx.js. Mirrors
   docs/FRIENDS_HOW_TO_USE.md. Keep this as the single source of
   truth for the guide's wording; edit here, not inline in JSX. */

export const FRIENDS_GUIDE = {
  title: '❓ How to Use the Friends Page',
  feedback:
    '**Something not working?** Go to **Settings → Feedback & Requests** and ' +
    'click **+ New Request** to submit a bug report — it goes straight to the Founder.',
  intro:
    "A full walkthrough of everything on this page — your directory of people, staying on " +
    "top of reach-outs and birthdays, and tracking prayers, notes, and events per person. " +
    "Skim the headers below or read start to finish.",
  sections: [
    {
      h: '📇 Directory View',
      blocks: [
        { p: "The default view — a photo-first grid of everyone in your hub, sorted so the people who need attention rise to the top." },
        { list: [
          "**Cadence Summary Bar** — clickable tiles for Overdue + Today, Upcoming, and No Schedule; plus a \"✨ Start Reach-Out\" button when someone's due.",
          "**Search** — matches name, role, church, or tags in real time.",
          "**Sort by** — Reach-out (urgent first), Most recently contacted, or Name (A–Z).",
          "**Filter chips** — All, Reach out, Birthdays, Close, Family, Church, Prayer, Mentor, Mentee, Co-worker.",
          "Cards show a status badge (⚡ \"Xd late\" / \"Today\", or 🎂 birthday), avatar, name, role · church, friend status, and last contact date.",
        ] },
      ],
    },
    {
      h: '💓 Pulse View',
      blocks: [
        { p: "A more visual read on your relationships. **Orbit mode** places you at the center with friends orbiting in warmth bands — Warm, Due, Cooling, Drifting. **Grid mode** shows the same people as color-coded cards. Both use the same underlying reach-out data as Directory — click anyone to open their detail panel." },
      ],
    },
    {
      h: '✦ Adding a Friend',
      blocks: [
        { p: "Click **✦ Add Friend** for the full form, or **+ Quick Add** for just a name (fill in the rest later). The full form covers who they are (name, nickname, status, role, church, city, birthday — with autocomplete from your Contacts), backstory (how you met, life season, life update), a reach-out schedule (specific weekdays or a simple cadence), and free-form tags & interests." },
      ],
    },
    {
      h: '👤 The Friend Detail Panel',
      blocks: [
        { p: "Click any friend to open a slide-over with reach-out and birthday banners up top, a **✓ Reached Out Today** button, and four tabs:" },
        { list: [
          "**👤 Profile & Reach Out** — life season, what they're going through, how you met, interests, reach-out schedule, birthday, quick notes, and Calendar sync toggles.",
          "**🙏 Prayer Requests** — every prayer/praise linked to them, with a button to start a new one pre-linked.",
          "**📅 Events & Birthdays** — their birthday plus any custom events, each with its own sync toggle.",
          "**📝 Notes** — a running timeline of conversations and moments worth remembering.",
        ] },
      ],
    },
    {
      h: '✨ Reach-Out Mode',
      blocks: [
        { p: "Click **✨ Reach Out** in the topbar to walk through everyone overdue or due today, one at a time. One-tap buttons — 📞 Called, 💬 Texted, 📧 Emailed, ☕ In person — log the contact and automatically advance to the next person. You can also open their full card, skip, or finish early. A completion screen sums up who you connected with." },
      ],
    },
    {
      h: '🔔 Notifications',
      blocks: [
        { p: "The activity bell shows a combined count of overdue reach-outs and today's birthdays. Reach-out items have a one-click **✓ Mark reached out** button; each item can be dismissed individually, and dismissals clear automatically once the status changes." },
      ],
    },
    {
      h: '📅 Calendar Sync',
      blocks: [
        { p: "Three things can sync to your Calendar page, all opt-in per friend: 🎂 birthday, ⚡ reach-out schedule (both toggled in the Profile tab), and individual custom events (toggled per event in the Events tab)." },
      ],
    },
    {
      h: '🔗 Integrations',
      blocks: [
        { list: [
          "**Prayers** — linking is bidirectional; link a friend from either page and it shows up in both.",
          "**Contacts** — typing a name that matches an accepted Contact connection auto-fills church, photo, and tags.",
        ] },
      ],
    },
    {
      h: '🛠 Troubleshooting',
      blocks: [
        { list: [
          "**\"Remove this friend?\"** — confirmation shown before permanently deleting a friend and their history.",
          "Add Friend / Add Event buttons stay disabled until their required fields (name; title + date) are filled in.",
          "**\"No prayers linked to this friend yet.\"** — link one from the Prayers page or the \"New Prayer for [Name]\" button.",
        ] },
      ],
    },
  ],
};
