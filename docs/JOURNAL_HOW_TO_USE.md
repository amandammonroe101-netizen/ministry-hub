# Journal — How to Use

A complete guide to the Journal page in Ministry Hub: writing entries, tracking your spiritual rhythm, memorizing scripture, and configuring reminders and privacy.

> 🛠 **Something not working?** Go to **Settings → Feedback & Requests** and click **+ New Request** to submit a bug report — it goes straight to the Founder.

> **A note on the pictures in this guide:** the Journal page sits behind Firebase sign-in, so this document couldn't be auto-illustrated with live screenshots of your account. Each major section below has a `📸 [Screenshot: ...]` placeholder marking exactly where to drop in a screenshot — sign in, navigate to that screen, capture it, and paste the image in place of the placeholder.

---

## Table of Contents

1. [Getting to the Journal Page](#1-getting-to-the-journal-page)
2. [The Dashboard](#2-the-dashboard)
3. [Writing an Entry](#3-writing-an-entry)
4. [Viewing an Entry](#4-viewing-an-entry)
5. [The Entry List (Sidebar)](#5-the-entry-list-sidebar)
6. [Scripture References](#6-scripture-references)
7. [Linking Prayers to Entries](#7-linking-prayers-to-entries)
8. [Locking Entries & Privacy](#8-locking-entries--privacy)
9. [Memory Verses & Spaced Repetition](#9-memory-verses--spaced-repetition)
10. [Reminders](#10-reminders)
11. [Notifications](#11-notifications)
12. [Page Settings (Full Reference)](#12-page-settings-full-reference)
13. [Profile](#13-profile)
14. [Themes](#14-themes)
15. [Exporting, Importing & Clearing Data](#15-exporting-importing--clearing-data)
16. [Troubleshooting & Error Messages](#16-troubleshooting--error-messages)

---

## 1. Getting to the Journal Page

Click **Journal** in the nav rail. The first time you open it, you'll land on the **Dashboard**. If you've set a *landing view* preference (Page Settings → Display), it may instead open directly into a new entry or your most recent entry.

If you've turned on the **Master Lock** (see [section 8](#8-locking-entries--privacy)), you'll see a lock screen first — enter your master code to continue. Master lock auto-re-engages after a period of inactivity (default 5 minutes).

📸 *[Screenshot: Journal master lock screen — "Journal is locked" with password field]*

---

## 2. The Dashboard

The Dashboard is your journaling home base — a snapshot of your writing habits, scripture engagement, and current memory verse. Every card on it can be shown or hidden individually (Page Settings → Display).

📸 *[Screenshot: full Dashboard, scrolled to show several cards]*

**Cards, top to bottom:**

- **Today's Reflection Prompt** — a rotating writing prompt with a "Write Today's Entry" button that jumps straight into the editor with that prompt attached.
- **Goals Progress** — bars showing how you're tracking against your daily/weekly entry targets (set in Page Settings → Writing). Shows a "🏖 On vacation" badge if you're in a configured vacation window.
- **Entry Stats Row** — total entries, entries in the last 7 days, whether you've written today, and how many distinct Bible books you've referenced.
- **Writing Rhythm** — a 30-day heatmap grid; darker squares are days you journaled.
- **Entry Length Over Time** — a bar chart of word counts across your last 20 entries.
- **Themes & Words** — a word cloud built from your most frequent words (common "stop words" are filtered out). Bigger/bolder words appear more often. Click to expand and see more.
- **Scripture Coverage** — which Old/New Testament books you've referenced, with a count per book.
- **On This Day** — past entries written on this same month/day in previous years. Click one to reopen it.
- **Memory Verse** — your current verse you're memorizing, with progress and spaced-repetition controls (see [section 9](#9-memory-verses--spaced-repetition)).

**If you have no entries yet**, the Dashboard shows a welcome card instead, with a short 3-step explainer and a button to write your first entry.

📸 *[Screenshot: empty-state Dashboard — "Begin your prayer journal"]*

---

## 3. Writing an Entry

Click the **✦ New Entry** button at the top of the sidebar, or "Write Today's Entry" from the Dashboard prompt card.

📸 *[Screenshot: blank entry editor with prompt banner, theme picker, title/body fields]*

**The editor, top to bottom:**

1. **Reflection Prompt banner** — shows a random prompt. Click **Use Prompt** to keep it attached to the entry, **Don't Use** to dismiss it, or **🔀 New** to swap in a different one. (Prompts can be turned off or filtered by category in Page Settings → Writing.)
2. **Theme picker** — choose one of 16 visual themes (Ocean, Sunset, Forest, Worship, Scripture, Midnight, etc.). The editor's background updates live as you pick, so what you see is what the finished entry will look like.
3. **Title** — a short field, e.g. "Morning prayer for the youth retreat."
4. **Body** — the main textarea. Supports lightweight inline formatting if Markdown is enabled in your editor settings: `**bold**`, `*italic*`, `` `code` ``, and `#` for headings.
5. **Word count bar** — only appears if you've set a word-count goal in Page Settings → Writing; turns green once you hit it.
6. **Scripture References** — add one or more Bible verses (see [section 6](#6-scripture-references)).
7. **Linked Prayers** — optional; only shows if you've enabled prayer linking in Page Settings → Integrations (see [section 7](#7-linking-prayers-to-entries)).
8. **Lock toggle** — 🔓/🔒 button to lock this specific entry with its own code (see [section 8](#8-locking-entries--privacy)).
9. **Save / Cancel** — **💾 Save Journal** is disabled until both a title and body are filled in.

**Drafts auto-save.** If enabled in your editor settings, your in-progress entry is saved to your browser every 600ms and automatically restored if you navigate away and come back before saving.

---

## 4. Viewing an Entry

Click any entry in the sidebar list (or "👁 View" in comfy card mode) to open it full-page.

📸 *[Screenshot: entry view mode showing themed header, scripture block, and body text]*

You'll see the entry's theme-colored header, its title, the date/word count, any scripture references (each collapsible), any linked prayers as clickable chips, and the full entry body.

**Actions available:**
- **✏ Edit Entry** — reopen it in the editor
- **⬇ Download** — save the entry as a `.txt` file
- **🗑 Delete** — permanently remove it (asks for confirmation)
- **⛶ Full Screen** — expand to a distraction-free view (press `Esc` to exit)
- **← Dashboard** — return to the Dashboard

---

## 5. The Entry List (Sidebar)

The left-hand sidebar lists all your entries and lets you search, filter, and manage them.

📸 *[Screenshot: sidebar entry list with search bar and a handful of entry cards]*

- **Search box** — searches title and body text in real time as you type.
- **Date range filter** — "From" / "To" date pickers to narrow the list to a specific window.
- **Sort order** — newest first, oldest first, or longest entries first (set in Page Settings → Display).
- **Card style** — choose *comfy* (date, word count, View/Edit buttons), *compact* (title + date only), or *title only* — set in Page Settings → Display.
- **Locked entries** show a 🔒 icon; if you've enabled "hide locked previews," their title is replaced with *Locked entry* in the list.
- **Collapse button** (›) — hides the sidebar to give the editor/viewer more room.

If there are no entries at all, you'll see "No entries yet" with a "Write first prayer" button. If a search or filter simply returns nothing, the list is just empty (no extra prompt).

---

## 6. Scripture References

From the entry editor, type a reference (e.g. `John 3:16` or `Psalm 23`) into the Scripture Reference field.

📸 *[Screenshot: scripture reference input with a fetched verse chip below it]*

- After a brief pause (about a second), the app automatically fetches the verse text from an online Bible API (KJV by default — the translation is configurable in your editor settings).
- Press **Enter** or click **Add** to save the reference to the entry.
- Add as many verses as you like; each appears as a chip you can expand/collapse or remove (✕).
- If the verse can't be fetched (e.g., no internet), you'll see "Couldn't load the verse text" — you can still keep the reference and add the text manually later.

---

## 7. Linking Prayers to Entries

This feature is off by default. Turn it on in **Page Settings → Integrations → "Link prayers to entries."**

Once enabled, a **Prayer** picker appears in the entry editor:

📸 *[Screenshot: prayer link picker dropdown in the entry editor, with a couple of linked-prayer chips]*

- Select any of your existing prayer requests from the dropdown to attach them to the entry.
- Linked prayers show as removable chips in the editor and as clickable chips in the entry viewer — clicking one jumps to the Prayers page filtered to that request.
- If you have no prayers yet, you'll see a prompt linking over to the Prayers page.

---

## 8. Locking Entries & Privacy

Journal supports two layers of locking:

### Per-entry lock
While editing an entry, click the 🔓 **Unlocked** button to set a code just for that entry. Once locked, opening it from the list requires that code.

📸 *[Screenshot: "Set Lock Code" modal]*

### Master lock
Set in **Page Settings → Privacy**. When enabled, the *entire* Journal page requires a master code before showing anything, and re-locks automatically after a period of inactivity you choose (Never / 5 / 15 / 30 minutes).

📸 *[Screenshot: Page Settings → Privacy tab]*

**Other privacy options (Page Settings → Privacy):**
- **Default lock code** — pre-fills a code so you don't have to type the same one for every new locked entry.
- **Hide locked entry previews** — replaces locked titles with "Locked entry" in the sidebar.
- **Exclude locked entries from search** — locked entries won't surface in the sidebar search box.

If you ever forget your master code, there's a **"Forgot code? Disable lock"** escape hatch on the lock screen — it asks you to confirm before removing the master lock entirely (note: this does *not* unlock individual per-entry codes, only the master gate).

---

## 9. Memory Verses & Spaced Repetition

The **Memory Verse** card on the Dashboard helps you memorize scripture over time.

📸 *[Screenshot: Memory Verse card, expanded, showing the verse text and progress controls]*

- **Set a verse** — type a reference; the app auto-fetches the text.
- **Expand/collapse** the verse text.
- **Mark as memorized** — archives the verse and clears any scheduled review reminders.
- **Spaced repetition schedule** — pick specific days on a calendar grid for review reminders; these can sync to your Calendar page.
- **Archive** — set a verse aside without marking it memorized.
- **Delete** — remove it entirely (confirmation required).

Past verses live under **Page Settings → Archived** and **Page Settings → Memorized**, where you can restore an archived verse as your current one, unmark a memorized verse, or delete verses permanently.

You can also schedule a recurring **"Pick New Verse"** reminder (weekly, biweekly, or monthly) under **Page Settings → Reminders**, so you're nudged to start memorizing something new.

---

## 10. Reminders

Click the **🔔 bell icon** in the Journal topbar, or go to **Page Settings → Reminders**, to manage journal reminders.

📸 *[Screenshot: Journal Reminders modal with an existing reminder and the "Add New Reminder" form]*

**To add a reminder:**
1. Set a time (24-hour format).
2. Optionally give it a label, e.g. "Morning devotion."
3. Pick which days it applies to — toggle individual days, or use the **Weekdays / Weekends / Daily** presets.
4. Click **✓ Add Reminder** (disabled until at least one day is selected).

Existing reminders can be edited (✏) or removed (✕). If you enable calendar sync on a reminder, matching events are created on your Calendar page and cleaned up automatically if you delete the reminder.

---

## 11. Notifications

The bell icon in the topbar also surfaces **in-app notifications** — for example, a nudge if you have a daily/weekly goal set and missed it, or skipped a day. Click the bell to open the popover; each notification can be dismissed individually, or all at once with **Dismiss all**. These are in-app only (not push/OS notifications), and which notification types are active can be adjusted in your settings.

---

## 12. Page Settings (Full Reference)

Open **Page Settings** from your profile avatar (top right of the Journal topbar) → the **📋 Page Settings** tab. It's organized into sub-tabs:

📸 *[Screenshot: Page Settings modal showing the sub-tab row]*

| Sub-tab | What it controls |
|---|---|
| **🔔 Reminders** | Journal entry reminders and the recurring "Pick New Verse" schedule |
| **🔒 Privacy** | Default/master lock codes, auto-lock timeout, locked-entry visibility in list & search |
| **✏️ Writing** | Reflection prompts (on/off, categories, custom prompts), daily/weekly goals, vacation mode |
| **🎨 Display** | Which Dashboard cards are visible, sort order, card density, date format, landing view |
| **📦 Archived** | Archived memory verses — restore as current or delete |
| **✓ Memorized** | Memorized verses — unmark or delete |
| **🔗 Integrations** | Toggle prayer linking on entries |
| **💾 Data** | Export, import, and clear-all-data tools (see [section 15](#15-exporting-importing--clearing-data)) |

---

## 13. Profile

The **👤 Profile** tab (same modal as Page Settings, first tab) lets you set your display name, ministry name and logo, ministry type(s), and a short bio. This profile is shared with the Chat feature elsewhere in Ministry Hub, so updating it here updates it everywhere.

📸 *[Screenshot: Profile tab with avatar, name fields, and ministry type chips]*

There's also a third tab, **⚙ Settings**, which embeds the full app Settings page inline, with a button to open it full-screen if you need more room.

---

## 14. Themes

Every entry can have its own visual theme, chosen from the dropdown in the editor. There are 16 themes total: Default, Ocean, Sunset, Forest, Lavender, Rose, Amber, Slate, Midnight, Crimson, Party, Music, Podcast, Web Dev, Worship, Scripture, and Missions. Each has a distinct gradient and a subtle decorative illustration behind the entry header — pick whatever fits the entry's tone (e.g. "Worship" for a service reflection, "Missions" for a trip journal).

📸 *[Screenshot: theme picker dropdown showing several gradient swatches]*

---

## 15. Exporting, Importing & Clearing Data

Under **Page Settings → Data**:

- **Export** — choose a format (`.txt`, `.md`, or `.json`), optionally include images, and download all your entries in one file. Good practice before clearing anything out.
- **Import** — paste exported data back in to restore entries.
- **Clear all data** — permanently deletes every journal entry. This asks for confirmation and cannot be undone — export first if there's any chance you'll want the entries again.

📸 *[Screenshot: Page Settings → Data tab]*

---

## 16. Troubleshooting & Error Messages

| Message | What it means |
|---|---|
| "Your journal storage is full... Export and clear old entries." | You've hit a per-document storage limit. Export your entries, then clear old ones. |
| "Couldn't reach Firestore. Check your internet..." | You're offline or Firestore is unreachable — try again once connected. |
| "Firestore rejected the write. Check security rules." | A permissions issue, usually unrelated to anything you did wrong in the UI. |
| "You're signed out. Sign back in..." | Your session expired — sign in again. |
| "Incorrect code." | Wrong entry lock or master lock code entered. |
| "Lock code cannot be empty." | You tried to set a lock without typing a code. |
| "Couldn't load the verse text..." | The Bible API lookup failed (usually a connectivity issue) — the reference is still saved, just without auto-fetched text. |

---

*This guide covers the Journal page as of the current build. If a screen looks different from what's described here, the feature may have moved to a newer settings location — check Page Settings first.*
