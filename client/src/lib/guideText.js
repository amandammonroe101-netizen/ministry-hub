/* Small shared helper for the in-app "How to Use" guides (Journal,
   Prayers, Friends Page Settings → How to Use tab).

   Guide content is authored as plain strings with lightweight
   **bold** markers (same convention as the docs/*.md files), so a
   single content object can drive both:
     - the on-screen JSX render (via renderInlineBold)
     - the downloadable Word doc (via parseInlineBold, see
       downloadGuideDocx.js)
   without keeping two copies of the text in sync by hand. */

import React from 'react';

const BOLD_RE = /(\*\*[^*]+\*\*)/g;

/* Turns "Some **bold** text" into an array of React nodes/strings
   suitable for JSX children, e.g. ['Some ', <b>bold</b>, ' text']. */
export function renderInlineBold(text) {
  const str = String(text == null ? '' : text);
  return str.split(BOLD_RE).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return React.createElement('b', { key: i }, part.slice(2, -2));
    }
    return part;
  });
}

/* Turns the same string into [{ text, bold }] segments for building
   docx TextRuns. */
export function parseInlineBold(text) {
  const str = String(text == null ? '' : text);
  return str.split(BOLD_RE).filter(Boolean).map(part => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return { text: part.slice(2, -2), bold: true };
    }
    return { text: part, bold: false };
  });
}
