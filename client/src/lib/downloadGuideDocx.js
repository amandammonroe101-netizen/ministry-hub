/* Generates a real .docx (Word) file from an in-app "How to Use"
   guide and triggers a browser download. Used by the Download
   button next to the guide header on the Journal, Prayers, and
   Friends "How to Use" Page Settings tabs.

   Guide shape:
   {
     title:    string,             // page title, may include an emoji prefix
     feedback: string,             // "Something not working?" callout text
     intro:    string,             // lead paragraph
     sections: [
       {
         h: string,                // section heading, may include an emoji prefix
         blocks: [
           { p: string },          // a paragraph
           { list: string[] },     // a bulleted list
           ...                     // blocks render in order, so a section
                                    // can be p -> list -> p, etc.
         ],
       },
       ...
     ],
   }
   Strings may contain **bold** markers (see guideText.js). */

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { parseInlineBold } from './guideText';

/* Strips a leading emoji/symbol + space from a title, e.g.
   "❓ How to Use the Journal Page" -> "How to Use the Journal Page". */
function stripLeadingEmoji(text) {
  return String(text || '').replace(/^[^\w]+\s*/u, '').trim();
}

function runsFor(text, extra) {
  return parseInlineBold(text).map(seg => new TextRun({
    text: seg.text,
    bold: seg.bold,
    ...extra,
  }));
}

export async function downloadGuideDocx(guide, filename) {
  const children = [];

  children.push(new Paragraph({
    text: stripLeadingEmoji(guide.title) || 'How to Use',
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
  }));

  if (guide.feedback) {
    children.push(new Paragraph({
      children: runsFor(guide.feedback, { italics: true }),
      spacing: { after: 200 },
    }));
  }

  if (guide.intro) {
    children.push(new Paragraph({
      children: runsFor(guide.intro),
      spacing: { after: 280 },
    }));
  }

  for (const sec of guide.sections || []) {
    children.push(new Paragraph({
      text: stripLeadingEmoji(sec.h),
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 100 },
    }));
    for (const block of sec.blocks || []) {
      if (block.p) {
        children.push(new Paragraph({
          children: runsFor(block.p),
          spacing: { after: 100 },
        }));
      }
      for (const item of block.list || []) {
        children.push(new Paragraph({
          children: runsFor(item),
          bullet: { level: 0 },
          spacing: { after: 60 },
        }));
      }
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
