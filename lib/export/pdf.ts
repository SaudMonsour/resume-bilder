import { PDFDocument, PDFName, PDFString, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fonts from './assets/pdf-fonts.json';
import { FORMATS, PAGE, validateExport, type ResumeBlock, type Run } from './resume-document';
import type { ResumeVersion } from '../domain/schema';

type Token = { text: string; font: PDFFont; size: number; width: number; href?: string; tracking: number };
const ink = rgb(0, 0, 0);
const decode = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0));

export async function createResumePdf(resume: ResumeVersion) {
  const blocks = validateExport(resume);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // Full embedding avoids dropped composite glyphs in fontkit's Carlito subsets.
  const [regular, bold, italic] = await Promise.all([fonts.Regular, fonts.Bold, fonts.Italic].map(data => document.embedFont(decode(data), { features: { liga: false, clig: false, calt: false, kern: false } })));
  const characterSets = new Map([regular, bold, italic].map(font => [font, new Set(font.getCharacterSet())]));
  const [width, height] = resume.paperSize === 'Letter' ? [612, 792] : [PAGE.width, PAGE.height];
  const usable = width - PAGE.left - PAGE.right;
  let page = document.addPage([width, height]);
  let y = height - PAGE.top;
  let previousAfter = 0;
  const ensure = (space: number) => { if (y - space < PAGE.bottom && y < height - PAGE.top) { page = document.addPage([width, height]); y = height - PAGE.top; } };
  const makeToken = (text: string, run: Run, block: ResumeBlock): Token => {
    const f = FORMATS[block.role];
    const font = (run.bold ?? f.bold) ? bold : (run.italic ?? f.italic) ? italic : regular;
    const size = run.size ?? f.size;
    const tracking = f.tracking ?? 0;
    // Never silently erase candidate characters from an exported CV.
    const supported = characterSets.get(font)!;
    for (const c of text) if (!/\s/.test(c) && !supported.has(c.codePointAt(0)!)) throw new Error('This PDF contains characters not supported by the export font. Download Word to preserve the original text.');
    return { text, font, size, tracking, width: font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * tracking, href: run.href };
  };
  const wrap = (block: ResumeBlock, maxWidth: number) => {
    const lines: Token[][] = [[]]; let used = 0;
    const append = (token: Token) => {
      if (!token.text) return;
      if (used + token.width > maxWidth && lines.at(-1)!.length) { lines.push([]); used = 0; }
      if (!used && /^\s+$/.test(token.text)) return;
      lines.at(-1)!.push(token); used += token.width;
    };
    for (const run of block.runs) for (const part of run.text.split(/(\s+)/).filter(Boolean)) {
      const token = makeToken(part, run, block);
      if (token.width <= maxWidth) append(token);
      else for (const char of part) append(makeToken(char, run, block));
    }
    return lines;
  };
  const draw = (token: Token, x: number, baseline: number) => {
    const startX = x;
    if (token.tracking) {
      for (const char of token.text) { page.drawText(char, { x, y: baseline, font: token.font, size: token.size, color: ink }); x += token.font.widthOfTextAtSize(char, token.size) + token.tracking; }
    } else page.drawText(token.text, { x, y: baseline, font: token.font, size: token.size, color: ink });
    if (token.href) {
      page.drawLine({ start: { x: startX, y: baseline - 1 }, end: { x: startX + token.width, y: baseline - 1 }, thickness: .5, color: ink });
      page.node.addAnnot(document.context.register(document.context.obj({ Type: PDFName.of('Annot'), Subtype: PDFName.of('Link'), Rect: [startX, baseline - 2, startX + token.width, baseline + token.size], Border: [0, 0, 0], A: { Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: PDFString.of(token.href) } })));
    }
  };
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]; const f = FORMATS[block.role];
    const indent = block.role === 'bullet' ? 8.65 : 0;
    const right = block.right ? makeToken(block.right, { text: block.right, size: 10, bold: false }, block) : undefined;
    // A long date moves to its own line; it never consumes a negative title width.
    const inlineRight = right && right.width < usable * .45;
    const lines = wrap(block, usable - indent - (inlineRight ? right.width + 12 : 0));
    const lineHeight = f.size * f.line * 1.22;
    const before = Math.max(0, f.before - previousAfter);
    let keep = 0;
    let previousGap = f.after;
    // Reserve the whole heading -> entry -> subtitle chain, including the first
    // content paragraph. Reserving only one line strands subtitles on page two.
    if (f.keepNext) for (let next = index + 1; next < blocks.length; next++) {
      const following = blocks[next];
      const nf = FORMATS[following.role];
      const count = wrap(following, usable - (following.role === 'bullet' ? 8.65 : 0)).length;
      keep += Math.max(0, nf.before - previousGap) + nf.size * nf.line * 1.22 * (nf.keepNext ? count : Math.min(count, 3)) + nf.after;
      previousGap = nf.after;
      if (!nf.keepNext) break;
    }
    ensure(before + lineHeight * (f.keepNext ? lines.length : Math.min(lines.length, 3)) + f.after + keep);
    y -= before;
    for (let i = 0; i < lines.length; i++) {
      ensure(lineHeight);
      const baseline = y - f.size;
      if (i === 0 && block.role === 'bullet') page.drawText('•', { x: PAGE.left, y: baseline, font: regular, size: 9, color: ink });
      let x = PAGE.left + indent;
      for (const token of lines[i]) { draw(token, x, baseline); x += token.width; }
      if (i === 0 && inlineRight) draw(right, width - PAGE.right - right.width, baseline);
      y -= lineHeight;
    }
    if (right && !inlineRight) {
      const dateBlock: ResumeBlock = { role: 'body', runs: [{ text: block.right!, size: 10 }] };
      for (const line of wrap(dateBlock, usable)) { ensure(13); let x = width - PAGE.right - line.reduce((sum,t) => sum + t.width, 0); for (const token of line) { draw(token, x, y - 10); x += token.width; } y -= 13; }
    }
    y -= f.after;
    previousAfter = f.after;
  }
  return document.save();
}
