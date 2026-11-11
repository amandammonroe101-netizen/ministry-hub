/* Testimony — How-To Guide tab body.

   Shown inside the Page Settings "How to Use" sub-tab (see
   TestimonyPageSettings in Testimony.jsx) as a typed-out, in-app
   version of docs/TESTIMONY_HOW_TO_USE.md — no screenshots, just
   the instructional text — plus a button to download the same
   guide as a formatted Word document. */

import testimonyGuideDocxUrl from '../../assets/testimony-how-to-guide.docx?url';
import './TestimonyGuide.css';

const STORY_ROWS = [
  { label: 'Before Christ 🌑', text: 'What was your life like before you knew Jesus? What were you searching for? What did you trust in?' },
  { label: 'How I Met Jesus ✨', text: 'How did you come to know Christ? Who shared the gospel? What moment(s) drew you to repentance and faith?' },
  { label: 'Life with Christ 🌅', text: 'What has changed since? How is God still shaping you? What hope do you have today?' },
];

const PRACTICE_ROWS = [
  { label: 'Elevator (30s) ⚡', target: '30 seconds', source: 'Pulled from your elevator draft on My Story' },
  { label: 'Short (2 min) ☕', target: '2 minutes', source: 'Pulled from your short draft on My Story' },
  { label: 'Full Story 📖', target: '5 minutes', source: 'No linked script — this is your unabridged testimony' },
];

const CIRCLE_ROWS = [
  { label: "God's Design 🟢", text: 'Life flourishes in relationship with God — peace, purpose, joy.', verse: 'Genesis 1:1' },
  { label: 'Brokenness 🔴', text: "We rejected God's design, causing brokenness in us, others, and the world.", verse: 'Romans 3:23' },
  { label: 'Gospel ✝️', text: "Jesus lived the life we couldn't, died the death we deserved, rose to give new life.", verse: '1 Peter 3:18' },
  { label: 'Repent & Believe 🙌', text: 'Turn from sin and trust Jesus to receive the gift.', verse: 'Mark 1:15' },
  { label: 'Recover & Pursue 🌱', text: "Restored to God's design, we pursue Him daily.", verse: '2 Corinthians 5:17' },
];

export default function TestimonyGuide() {
  return (
    <div className="tg-root">
      <header className="tg-header">
        <div>
          <h2 className="tg-title">Testimony — How to Use</h2>
          <p className="tg-subtitle">
            A complete guide to writing your salvation story, rehearsing it,
            working the 3 Circles, and keeping other gospel tools on hand.
          </p>
        </div>
        <a
          className="tg-download"
          href={testimonyGuideDocxUrl}
          download="Testimony - How to Use.docx"
        >
          ⬇ Download as Word doc
        </a>
      </header>

      <Section n="1" title="Getting to the Testimony Page">
        <p>Click <b>Testimony</b> (🙌) in the nav rail. The page opens on the <b>My Story</b> tab by default.</p>
      </Section>

      <Section n="2" title="Before You Begin (Welcome Modal)">
        <p>
          Every visit opens with a short welcome message: a reminder that this page is a
          <i> tool</i>, not a substitute for the Holy Spirit's leading, paired with James 1:5
          ("If any of you lacks wisdom, you should ask God, who gives generously to all
          without finding fault, and it will be given to you.").
        </p>
        <p>Click <b>Amen — continue</b> (or press <b>Esc</b>) to dismiss it and reach the page.</p>
      </Section>

      <Section n="3" title="Locked Fields — Why Text Boxes Start Read-Only">
        <p>
          Every text field on this page — story sections, key verse, condensed versions,
          practice notes, 3 Circles phrasing — starts <b>locked</b> (read-only, shown with a
          "Double-click to edit" tooltip).
        </p>
        <ul className="tg-list">
          <li>Double-click (or double-tap) a field to unlock it and start typing.</li>
          <li>The field re-locks automatically when you click away (on blur).</li>
        </ul>
        <p>
          This is intentional: these fields are meant to be reflected on, not dashed off, so
          an accidental click while you're reading or praying won't disturb what's already written.
        </p>
      </Section>

      <Section n="4" title="My Story">
        <p>
          The <b>📖 My Story</b> tab is where you write your salvation testimony in three
          parts, add a key verse, and boil it down into shorter versions.
        </p>

        <h4 className="tg-h4">Progress card</h4>
        <p>
          A bar at the top showing what percentage of the three core sections you've filled
          in, with a reminder that each should be short, honest, and specific.
        </p>

        <h4 className="tg-h4">Three story sections</h4>
        <div className="tg-rows">
          {STORY_ROWS.map(r => (
            <div className="tg-row" key={r.label}>
              <div className="tg-row-label">{r.label}</div>
              <div className="tg-row-text">{r.text}</div>
            </div>
          ))}
        </div>
        <p className="tg-note">Each card shows a live word count under the text box.</p>

        <h4 className="tg-h4">Key Verse 📜</h4>
        <p>A scripture that anchors your testimony, meant to be used as a bridge into the story or a closing line.</p>

        <h4 className="tg-h4">Condensed Versions</h4>
        <p>Below the full story, two shorter drafts to prepare separately:</p>
        <ul className="tg-list">
          <li><b>Elevator (30 seconds) ⚡</b> — three sentences: where you were, what changed, where you are now.</li>
          <li><b>Short (2 minutes) ☕</b> — a coffee-shop-length version that still shares the gospel through your story.</li>
        </ul>
        <p>These two condensed drafts feed directly into the Practice tab's scripts.</p>
      </Section>

      <Section n="5" title="Practice">
        <p>The <b>⏱ Practice</b> tab is a rehearsal timer for whichever version of your story you want to sharpen.</p>

        <h4 className="tg-h4">Pick your version</h4>
        <div className="tg-rows">
          {PRACTICE_ROWS.map(r => (
            <div className="tg-row tg-row-3" key={r.label}>
              <div className="tg-row-label">{r.label}</div>
              <div className="tg-row-mid">{r.target}</div>
              <div className="tg-row-text">{r.source}</div>
            </div>
          ))}
        </div>

        <h4 className="tg-h4">Running the timer</h4>
        <ul className="tg-list">
          <li><b>▶ Start / Resume</b> — begins or continues the clock.</li>
          <li><b>⏸ Pause</b> — stops it without resetting.</li>
          <li><b>↺ Reset</b> — clears the elapsed time back to zero.</li>
          <li>The clock face changes color as you approach and pass your target (on-pace → close → over).</li>
          <li><b>📜 Show your [version] script</b> — an expandable panel showing the matching draft from My Story. If you haven't written that version yet, it prompts you to head to My Story first.</li>
          <li>A notes field lets you jot what flowed or felt clunky before saving.</li>
          <li><b>💾 Save attempt</b> — records the duration, target, and your notes to History (disabled until the timer has run at least once).</li>
        </ul>

        <h4 className="tg-h4">History</h4>
        <p>
          Every saved attempt, newest first, showing the duration, how far over/under target
          it was (±5s tolerance before it's flagged), the version, the date, and your notes.
          Each entry can be deleted.
        </p>
      </Section>

      <Section n="6" title="3 Circles">
        <p>
          The <b>⭕ 3 Circles</b> tab walks you through the 3-Circles evangelism diagram,
          letting you capture your own phrasing for each part and practice sketching it.
        </p>

        <h4 className="tg-h4">Practice drawing (whiteboard)</h4>
        <p>
          A blank canvas you can draw on directly with mouse or touch, to build muscle
          memory for sketching the diagram on a napkin or whiteboard in real life. Click
          <b> 🧹 Erase</b> to clear it.
        </p>

        <h4 className="tg-h4">The five steps</h4>
        <p>
          Click any node in the diagram to jump to it, or use the ← / → navigation at the
          bottom of the detail panel. A dot appears on any node you've already written
          something for.
        </p>
        <div className="tg-rows">
          {CIRCLE_ROWS.map(r => (
            <div className="tg-row tg-row-3" key={r.label}>
              <div className="tg-row-label">{r.label}</div>
              <div className="tg-row-text">{r.text}</div>
              <div className="tg-row-mid">{r.verse}</div>
            </div>
          ))}
        </div>
        <p>
          For each step, write your own explanation in the text box provided — the goal is
          to have the words ready before the moment you need them.
        </p>
      </Section>

      <Section n="7" title="More Methods">
        <p>
          The <b>🌉 More Methods</b> tab is a reference — not something you fill in —
          covering two other classic gospel-sharing diagrams to keep alongside the 3 Circles.
        </p>
        <h4 className="tg-h4">🌉 Bridge to Life</h4>
        <p>
          A drawing of a chasm bridged by the cross, in four steps: God Loves You
          (John 3:16) → Our Problem: Sin (Romans 6:23a) → God's Solution (Romans 5:8) →
          Our Response (Romans 10:9).
        </p>
        <h4 className="tg-h4">🛣 Romans Road</h4>
        <p>
          A path of verses straight from Romans, in five steps: All have sinned
          (Romans 3:23) → The wages of sin is death (Romans 6:23) → God demonstrates His
          love (Romans 5:8) → Confess and believe (Romans 10:9–10) → Peace with God
          (Romans 5:1).
        </p>
        <p>Each step lists a title, a short explanation, and its verse reference for quick recall.</p>
      </Section>

      <Section n="8" title="Where Your Data Lives">
        <p>
          Everything on this page — your story, key verse, condensed versions, 3 Circles
          phrasing, and practice history — is saved automatically. There's no separate save
          button for the page as a whole; individual actions (editing a field, saving a
          practice attempt) persist immediately.
        </p>
      </Section>

      <p className="tg-footnote">
        This guide covers the Testimony page as of the current build. If a screen looks
        different from what's described here, the feature may have moved — check the tabs
        above first.
      </p>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section className="tg-section">
      <h3 className="tg-h3">{n}. {title}</h3>
      {children}
    </section>
  );
}
