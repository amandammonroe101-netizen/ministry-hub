# Prayers — How to Use

A complete guide to the Prayers page in Ministry Hub: tracking prayer requests and praise, working through them with Pray Now, linking friends, and configuring reminders and categories.

> 🛠 **Something not working?** Go to **Settings → Feedback & Requests** and click **+ New Request** to submit a bug report — it goes straight to the Founder.

> **A note on the pictures in this guide:** the Prayers page sits behind Firebase sign-in, so this document couldn't be auto-illustrated with live screenshots of your account. Each major section below has a `📸 [Screenshot: ...]` placeholder marking exactly where to drop in a screenshot — sign in, navigate to that screen, capture it, and paste the image in place of the placeholder.

---

## Table of Contents

1. [Getting to the Prayers Page](#1-getting-to-the-prayers-page)
2. [The Dashboard](#2-the-dashboard)
3. [The Board (Kanban)](#3-the-board-kanban)
4. [Adding a Prayer or Praise](#4-adding-a-prayer-or-praise)
5. [The Prayer Detail View](#5-the-prayer-detail-view)
6. [Pray Now (Guided Session)](#6-pray-now-guided-session)
7. [Linking Friends to a Prayer](#7-linking-friends-to-a-prayer)
8. [Scripture References](#8-scripture-references)
9. [Reminders](#9-reminders)
10. [Notifications](#10-notifications)
11. [Page Settings (Full Reference)](#11-page-settings-full-reference)
12. [Profile](#12-profile)
13. [Exporting Your Prayers](#13-exporting-your-prayers)
14. [Troubleshooting & Error Messages](#14-troubleshooting--error-messages)

---

## 1. Getting to the Prayers Page

Click **Prayers** in the nav rail. By default you'll land on the **Dashboard**; you can change this to the **Board** in Page Settings → Display & Layout → "Open page on."

📸 *[Screenshot: Prayers topbar showing the Dashboard/Board view switcher]*

---

## 2. The Dashboard

The Dashboard is a snapshot of your prayer wall — what needs attention today, what's been answered, and what you've been carrying the longest.

📸 *[Screenshot: full Prayers Dashboard, scrolled to show several cards]*

**Sections, top to bottom:**

- **🙏 Pray Now banner** — a big CTA showing how many prayers are ready to walk through ("Walk through X prayers — urgent, daily, and long-standing"). Click to launch [Pray Now](#6-pray-now-guided-session).
- **Today's Focus** — up to 6 urgent and daily-list prayers, each with a status pill, title, category, and age. Click any row to open it. A "Open daily list →" link jumps to the full filtered list.
- **Stats Row** — six clickable tiles: **Total**, **Answered**, **Urgent**, **Daily**, **Praise**, and **30+ days**. Clicking any tile jumps to the Board pre-filtered to that group.
- **Answer Rate** — a progress bar showing the percentage of prayers marked answered (toggle on/off in Page Settings → Display).
- **Recent Testimonies** — up to 4 recently answered prayers, with a "See all →" link to the answered filter.
- **Carrying Longest** — up to 3 of your oldest still-open prayers, with days-on-the-wall shown for each.
- **Category Bars** — a horizontal bar chart showing how your prayers are distributed across categories (toggle on/off in Page Settings → Display).
- **Encouragement Verse** — a scripture verse of your choosing (default Philippians 4:6), auto-looked-up and cached (configurable in Page Settings → Display).

**If you have no prayers yet**, you'll see a welcome card instead: "Your prayer wall is waiting," an "✦ Add First Prayer" button, and a note that Pray Now will guide you once you've added a few.

📸 *[Screenshot: empty-state Dashboard — "Your prayer wall is waiting"]*

---

## 3. The Board (Kanban)

Switch to **📋 Board** from the topbar to see every prayer as a draggable card across three columns.

📸 *[Screenshot: Prayer Board with three columns — Praying, Answered, Praise — showing several cards]*

- **🙏 Praying** — all open/active requests.
- **✓ Answered** — testimonies of what God has done.
- **✨ Praise** — gratitude entries with no request attached.

**Working with cards:**
- **Drag a card** from one column to another to change its status instantly.
- **Click a card** to open the full [detail view](#5-the-prayer-detail-view).
- Each card shows status pills (🔥 Urgent, 📆 Daily), category, age, a content snippet, and linked-friend chips (👥) if any friends are attached.
- Urgent prayers automatically float to the top of the Praying column.
- Card density (comfy vs. compact) and sort order (newest / oldest / most updates) are both set in Page Settings → Display & Layout.

If the board is empty, you'll see "No prayers yet" with a "✦ New Prayer" button.

---

## 4. Adding a Prayer or Praise

Click **✦ New Prayer** in the topbar (visible on the Board view) or "✦ Add First Prayer" from an empty Dashboard.

📸 *[Screenshot: New Prayer Request form with kind toggle, title, body, scripture, category]*

**Form fields:**

1. **Kind toggle** — 🙏 Praying / ✓ Answered / ✨ Praise. Choosing **Praise** simplifies the form (hides urgent/daily flags, since praise entries aren't requests).
2. **Title** — placeholder changes with kind ("What are you lifting up to God?" vs. "What are you giving thanks for?").
3. **Body** — the main content field; same kind-aware placeholder behavior.
4. **Scripture** — add one or more Bible references; each is auto-looked-up (see [section 8](#8-scripture-references)).
5. **Category** — pick from built-in categories (General, Health, Family, Church, Provision, Guidance, Relationships, Ministry, Other) or any custom categories you've added in Page Settings.
6. **Flags** (hidden for Praise entries):
   - 🔥 **Urgent** — needs immediate intercession.
   - 📆 **Daily** — adds it to your daily prayer list, shown on the Dashboard's Today's Focus card.
7. **Praying for (optional)** — toggle any of your Friends on to link them to this prayer (only shown if you have friends saved).

**Save button** changes label by kind/mode: "🙏 Submit Prayer," "✨ Save Praise," or "💾 Save Changes" when editing. It's disabled until both title and body are filled in, and shows "Saving…" while submitting.

---

## 5. The Prayer Detail View

Click any prayer card (Dashboard or Board) to open its full detail modal.

📸 *[Screenshot: Prayer detail modal, Prayer tab active, showing pills, title, and tab row]*

**Header:**
- Status pills: kind (🙏/✓/✨), 🔥 Urgent, 📆 Daily, and category.
- **✏ Edit** and **🗑 Delete** buttons (delete asks for confirmation).
- Title, date created, age ("Today" / "X days on the wall"), and update count.

**Five tabs:**

### 📖 Prayer
The original request text, any scripture references (collapsible per verse), the category, and controls to change status (Praying/Answered/Praise) or toggle the Urgent/Daily flags independently of status.

### 🙏 Updates
A running timeline of how things are unfolding. Type in the composer ("How is God moving? Share an update...") and press **⌘+Enter** (or click **+ Add Update**) to post. Each update can be deleted individually (with confirmation). Shown newest-first.

📸 *[Screenshot: Updates tab with a couple of timeline entries and the composer]*

### 👥 Praying For
Manage which Friends are linked to this prayer — see [section 7](#7-linking-friends-to-a-prayer).

### 📊 Insights
Four quick metrics: days on the wall, total updates, days since last update, and updates per week — plus a contextual tip that changes based on your update history (e.g. a nudge if it's been 14+ days since the last update).

---

## 6. Pray Now (Guided Session)

Click the **🙏 Pray Now** banner on the Dashboard to start a guided walkthrough of what needs prayer right now.

📸 *[Screenshot: Pray Now session card showing a prayer, reflection textarea, and controls]*

**How the queue is built** (capped at 12 prayers):
1. All urgent active prayers
2. All daily-list prayers not already included above
3. Up to 3 of your oldest active prayers (30+ days)
4. Up to 3 praise entries, saved for last so the session ends on gratitude

**For each prayer in the queue**, you'll see its title, full content, category, age, scripture, and any linked friends. An optional reflection box lets you jot down "Something God placed on your heart while praying…" before moving on.

**Controls:**
- **← Back** — return to the previous prayer
- **✓ Mark answered** — flips status to answered and auto-advances (not shown for praise entries)
- **✎ Open in Wall** — bail out to the Board with this prayer open
- **Skip** — advance without saving a reflection
- **Done, Next →** / **Finish 🙏** — saves your reflection (if any) and moves on

When you finish the queue, you'll see a completion screen ("Amen.") with a summary and the option to pray through the list again or head back to the Dashboard.

If there's nothing to pray through, you'll see "Your wall is clear" instead.

---

## 7. Linking Friends to a Prayer

From the **👥 Praying For** tab in a prayer's detail view (or the "Praying for" section in the New/Edit form), you can attach any of your saved Friends to a prayer.

📸 *[Screenshot: Praying For tab showing linked friend chips and the add-friend picker]*

- Linked friends appear as chips with an avatar and name; click the ✕ on a chip to unlink.
- Click **+ Add a friend to this prayer** to open a picker listing everyone not already linked — click **+** next to a name to add them.
- If you haven't added any Friends yet, you'll see a prompt to do that first from the Friends page.

This link is bidirectional — the same prayer will show up under that friend's **🙏 Prayer Requests** tab on the Friends page, with a "🔗 Open in Prayers tab" button to jump back.

---

## 8. Scripture References

Both the New/Edit Prayer form and the Encouragement Verse setting support the same scripture lookup used throughout Ministry Hub.

📸 *[Screenshot: scripture input field with a resolved verse preview underneath]*

- Type a reference (e.g. `Romans 8:28-39`) and either press **Enter** or click **+ Add**.
- After a short pause, the verse text is automatically fetched and shown as a preview.
- Add as many verses as you like; each can be collapsed/expanded or removed.
- If the reference can't be found, you'll see "Couldn't find that reference — you can still add it as a reference-only entry," and the reference is saved without resolved text.

---

## 9. Reminders

Configure a daily prayer nudge in **Page Settings → 🔔 Reminders**.

📸 *[Screenshot: Page Settings → Reminders tab with day toggles and calendar sync]*

- **Enable prayer reminder** — master on/off switch.
- **Days** — pick which days of the week it applies to (Sun–Sat toggles).
- **Sync to Calendar** — when on, creates recurring events on your Calendar page for the selected days.
- **Sync horizon** — how many weeks of events to generate ahead (1 to 52 weeks).
- Once synced, a **"📅 View reminder(s) in Calendar →"** link appears, taking you straight to those events.

---

## 10. Notifications

The **🔔 bell icon** in the topbar surfaces two kinds of in-app alerts:

- **🙏 Prayer reminder** — appears on days your reminder is scheduled: "Time to pray — Spend some time in prayer today."
- **⏳ Long-standing alerts** — one per prayer that's been open past your configured threshold (default 30 days): "Still on the wall — '[Title]' — X days waiting." Click one to jump straight to that prayer on the Board.

Each notification can be dismissed individually, or all at once with **Dismiss all**. Dismissals reset each day at midnight. Which notification types are active can be adjusted in Page Settings → Integrations.

📸 *[Screenshot: notification bell popover with a long-standing alert and a reminder]*

---

## 11. Page Settings (Full Reference)

Open **Page Settings** from your profile avatar (top right) → **📋 Page Settings** tab. It's organized into sub-tabs:

📸 *[Screenshot: Page Settings modal showing the sub-tab row]*

| Sub-tab | What it controls |
|---|---|
| **🔔 Reminders** | Daily prayer reminder, days, and calendar sync (see [section 9](#9-reminders)) |
| **🎨 Display & Layout** | Landing view (Dashboard/Board), sort order, card density, which Dashboard cards show, and the Encouragement Verse reference |
| **🗂 Custom Categories** | Add/remove your own categories beyond the built-in list |
| **🔗 Integrations** | Toggle linking prayers to journal entries and adding the daily list to Day Planner; notification behavior (long-standing alerts, urgent nav badge) |
| **📦 Archived** | Every answered prayer, with **↺ Re-open** (send back to Praying) or **🗑 Delete** |
| **💾 Data & Export** | Default export format and a one-click download of all prayers (see [section 13](#13-exporting-your-prayers)) |

---

## 12. Profile

The **👤 Profile** tab (same modal, first tab) is shared across Journal, Prayers, and Friends — updating your display name, ministry info, or photo here updates it everywhere. A third **⚙ Settings** tab embeds the full app Settings page.

---

## 13. Exporting Your Prayers

Under **Page Settings → 💾 Data & Export**:

- Choose a **default export format** — Markdown (`.md`), plain text (`.txt`), or JSON (`.json`).
- Choose whether to **include updates** and **include linked friends** in the export.
- Click **⬇ Download all prayers** to save everything as a dated file (e.g. `prayers-2026-07-04.json`).

📸 *[Screenshot: Page Settings → Data & Export tab]*

---

## 14. Troubleshooting & Error Messages

| Message | What it means |
|---|---|
| "Couldn't find that reference — you can still add it as a reference-only entry." | The Bible API lookup failed for a scripture reference; the reference itself is still saved. |
| "Delete this prayer? This cannot be undone." | Confirmation shown before permanently deleting a prayer. |
| "Delete this update? This cannot be undone." | Confirmation shown before permanently deleting a single update entry. |
| Save button stays disabled | Title and/or body are still empty — both are required. |
| "Saving…" / "Posting…" stuck | The write is still in flight; if it never clears, check your connection and try again. |

---

*This guide covers the Prayers page as of the current build. If a screen looks different from what's described here, the feature may have moved to a newer settings location — check Page Settings first.*
