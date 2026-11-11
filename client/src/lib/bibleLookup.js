/* Shared bible-api.com lookup. Originally implemented inline in
   Journal.jsx; extracted here so the Prayers page can use the same
   verse-resolution behavior without duplicating the parsing logic.

   The endpoint returns either a single `text` blob or a `verses[]`
   array. We prefer the array because it preserves verse numbers and
   lets us group consecutive verses by chapter for cleaner display
   (e.g. "Romans 8:28-39" comes back as 12 separate rows we collapse
   into one "Romans 8" header + numbered lines).

   Returns the empty string on any error so callers can treat the
   result as "no resolved text" without try/catch. */
export async function fetchVerseText(ref, translation = 'kjv') {
  if (!ref || !ref.trim()) return '';
  try {
    const encoded = encodeURIComponent(ref.trim());
    const trans   = encodeURIComponent(translation || 'kjv');
    const res = await fetch(`https://bible-api.com/${encoded}?translation=${trans}`);
    if (!res.ok) return '';
    const data = await res.json();
    if (data.error) return '';

    const verses = data.verses || [];
    if (!verses.length) return (data.text || '').trim();

    /* Group consecutive verses by book + chapter for clean reading. */
    const grouped = [];
    let lastRef = '';
    verses.forEach(v => {
      const groupRef = `${v.book_name} ${v.chapter}`;
      const verseText = (v.text || '').replace(/\n/g, ' ').trim();
      if (groupRef !== lastRef) {
        grouped.push({ ref: groupRef, verses: [`${v.verse}. ${verseText}`] });
        lastRef = groupRef;
      } else {
        grouped[grouped.length - 1].verses.push(`${v.verse}. ${verseText}`);
      }
    });
    return grouped.map(g => `${g.ref}\n${g.verses.join(' ')}`).join('\n\n');
  } catch {
    return '';
  }
}

/* Heuristic: a string looks like a scripture reference only when it
   contains a digit somewhere — "John 3:16", "Psalm 23", "1 Cor 13".
   "John" alone or "love" doesn't trigger a fetch. Callers debounce on
   top of this so we don't spam the API on every keystroke. */
export function looksLikeReference(s) {
  return typeof s === 'string' && /\d/.test(s);
}
