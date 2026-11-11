/* Resource Library → "Add a book with AI"

   Two separate lookups, kept strictly apart so nothing is fabricated:

     1. describeWithAI() asks Gemini (Firebase AI Logic) ONLY for
        descriptive, non-factual content — what the book is about, what
        kind of resource it is, which themes it touches, and (for a new
        author) a short bio. It is explicitly never asked for ISBN,
        page count, or publish date.

     2. lookupOpenLibrary() fetches the real cover image, ISBN, page
        count, and publish date from Open Library's public search API —
        the same source used to hand-verify every other book in this
        library. If Open Library has no confident match, those fields
        are simply omitted rather than guessed.

   The caller merges both into one preview the user can review/edit
   before saving. */

import { app } from '../../lib/firebase';
import { ASPECT_LIST, WORK_TYPE_ORDER } from './suggestedAuthors';

async function describeWithAI({ title, authorName, needsAuthorBio }) {
  if (!app) return null;
  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: 'gemini-2.0-flash' });

    const prompt =
`You are cataloging a real, published Christian resource for a women's ministry library.
Book/resource title: "${title}"
${authorName ? `Author: "${authorName}"` : 'Author: not given — identify the real author if you recognize this title.'}

Respond with ONLY compact JSON (no markdown, no code fences, no commentary) shaped exactly like this:
{
  "authorName": "<the real author's full name>",
  "workType": "<one of: devotional, book, bible-study, song, commentary>",
  "aspects": ["<0 to 2 themes chosen ONLY from this exact list: ${ASPECT_LIST.join(', ')}>"],
  "about": "<two short paragraphs, separated by \\n\\n, describing what THIS specific book covers>"${needsAuthorBio ? `,
  "authorTagline": "<a short 4-8 word tagline for this author>",
  "authorBio": "<two short paragraphs, separated by \\n\\n, about this author's background and body of work>"` : ''}
}
If you don't actually recognize this as a real, published title, respond with {"about":""} and nothing else — do not invent details.`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI book lookup timed out')), 9000)),
    ]);
    const raw = result?.response?.text?.() || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed || !parsed.about) return null;
    return parsed;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[aiBookLookup] AI unavailable:', e?.message || e);
    return null;
  }
}

/** Real bibliographic facts only — never fabricated. Omits any field
 *  Open Library doesn't confidently have rather than guessing. */
async function lookupOpenLibrary({ title, authorName }) {
  try {
    const q = encodeURIComponent(`${title} ${authorName || ''}`.trim());
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=1&fields=title,author_name,isbn,first_publish_year,cover_i,number_of_pages_median`
    );
    if (!res.ok) return {};
    const data = await res.json();
    const doc = data?.docs?.[0];
    if (!doc) return {};
    const isbn = Array.isArray(doc.isbn) ? doc.isbn.find((i) => /^[0-9Xx]{9,13}$/.test(i)) : null;
    const out = {};
    if (doc.cover_i) out.coverId = doc.cover_i;
    if (isbn) out.isbn = isbn;
    if (doc.number_of_pages_median) out.pages = doc.number_of_pages_median;
    if (doc.first_publish_year) out.publishedDate = String(doc.first_publish_year);
    return out;
  } catch {
    return {};
  }
}

/** When the user only knows the author (not a specific title), list
 *  real works by that author from Open Library so they can pick the
 *  one they meant — never asks AI to name titles, since it could
 *  hallucinate ones that don't exist. Deduplicated by title, sorted
 *  newest-first, capped to a reasonable pick-list size. */
export async function searchBooksByAuthor(authorName) {
  const name = (authorName || '').trim();
  if (!name) return [];
  try {
    const q = encodeURIComponent(name);
    const res = await fetch(
      `https://openlibrary.org/search.json?author=${q}&limit=40&fields=title,first_publish_year,cover_i,isbn,number_of_pages_median`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const docs = Array.isArray(data?.docs) ? data.docs : [];
    const byTitle = new Map();
    for (const doc of docs) {
      const title = (doc.title || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const existing = byTitle.get(key);
      if (existing && existing.coverId) continue; // keep the first edition that has a cover
      const isbn = Array.isArray(doc.isbn) ? doc.isbn.find((i) => /^[0-9Xx]{9,13}$/.test(i)) : null;
      byTitle.set(key, {
        title,
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
        coverId: doc.cover_i || null,
        isbn: isbn || null,
        pages: doc.number_of_pages_median || null,
      });
    }
    return Array.from(byTitle.values())
      .sort((a, b) => (b.publishedDate || '0').localeCompare(a.publishedDate || '0'))
      .slice(0, 24);
  } catch {
    return [];
  }
}

/** When the user knows the title but not the author, find the real
 *  author(s) of a book with that EXACT title on Open Library — useful
 *  when two different authors happen to share a title, or the user
 *  simply doesn't know who wrote it. Open Library's title search is
 *  fuzzy, so results are filtered down to an exact (case-insensitive)
 *  title match before being returned. Never asks AI to guess an
 *  author, since it could hallucinate one. */
export async function searchAuthorsByTitle(title) {
  const wanted = (title || '').trim();
  if (!wanted) return [];
  try {
    const q = encodeURIComponent(wanted);
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${q}&limit=40&fields=title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const docs = Array.isArray(data?.docs) ? data.docs : [];
    const wantedLower = wanted.toLowerCase();
    const byAuthor = new Map();
    for (const doc of docs) {
      if ((doc.title || '').trim().toLowerCase() !== wantedLower) continue;
      const authorName = Array.isArray(doc.author_name) ? doc.author_name[0] : null;
      if (!authorName) continue;
      const key = authorName.toLowerCase();
      const existing = byAuthor.get(key);
      if (existing && existing.coverId) continue; // keep the first edition that has a cover
      const isbn = Array.isArray(doc.isbn) ? doc.isbn.find((i) => /^[0-9Xx]{9,13}$/.test(i)) : null;
      byAuthor.set(key, {
        authorName,
        title: doc.title.trim(),
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
        coverId: doc.cover_i || null,
        isbn: isbn || null,
        pages: doc.number_of_pages_median || null,
      });
    }
    return Array.from(byAuthor.values())
      .sort((a, b) => a.authorName.localeCompare(b.authorName))
      .slice(0, 24);
  } catch {
    return [];
  }
}

/** Full lookup: AI description + real Open Library facts, merged.
 *  Returns null only if the AI leg fails entirely (caller should let
 *  the user fill the form in by hand in that case). */
export async function lookupBookWithAI({ title, authorName, needsAuthorBio }) {
  const [ai, bibliography] = await Promise.all([
    describeWithAI({ title, authorName, needsAuthorBio }),
    lookupOpenLibrary({ title, authorName }),
  ]);
  if (!ai) return null;
  return {
    resolvedAuthorName: (ai.authorName || authorName || '').trim(),
    workType: WORK_TYPE_ORDER.includes(ai.workType) ? ai.workType : 'book',
    aspects: Array.isArray(ai.aspects) ? ai.aspects.filter((a) => ASPECT_LIST.includes(a)).slice(0, 2) : [],
    about: (ai.about || '').trim(),
    authorTagline: (ai.authorTagline || '').trim(),
    authorBio: (ai.authorBio || '').trim(),
    bibliography,
  };
}
