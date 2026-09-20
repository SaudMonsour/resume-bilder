import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import source from './assets/reference-template.json';
import { FORMATS, validateExport, type ResumeBlock, type Run } from './resume-document';
import type { ResumeVersion } from '../domain/schema';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

export function createResumeDocx(resume: ResumeVersion): Uint8Array {
  const blocks = validateExport(resume);
  const parts = unzipSync(Uint8Array.from(atob(source.base64), c => c.charCodeAt(0)));
  const relationships: string[] = [];
  let linkId = 0;
  const runXml = (run: Run, block: ResumeBlock) => {
    const format = FORMATS[block.role];
    const bold = run.bold ?? format.bold ?? false;
    const italic = run.italic ?? format.italic ?? false;
    const size = run.size ?? format.size;
    const props = `<w:rPr><w:b w:val="${bold ? 1 : 0}"/><w:i w:val="${italic ? 1 : 0}"/><w:sz w:val="${Math.round(size * 2)}"/><w:color w:val="000000"/>${run.href ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
    const content = `<w:r>${props}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
    if (!run.href) return content;
    const id = `tailorLink${++linkId}`;
    relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(run.href)}" TargetMode="External"/>`);
    return `<w:hyperlink r:id="${id}">${content}</w:hyperlink>`;
  };
  const paragraphs = blocks.map(block => {
    let props = source.paragraphProperties[block.role];
    // Clone the reference's paragraph styles, spacing, hanging indents, and tabs.
    if (block.role === 'entry' && resume.paperSize === 'Letter') props = props.replace('w:pos="10123"', 'w:pos="10454"');
    const bullet = block.role === 'bullet' ? '<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">• </w:t></w:r>' : '';
    const right = block.right ? `<w:r><w:rPr><w:b w:val="0"/><w:sz w:val="20"/></w:rPr><w:tab/><w:t>${escapeXml(block.right)}</w:t></w:r>` : '';
    return `<w:p>${props}${bullet}${block.runs.map(run => runXml(run, block)).join('')}${right}</w:p>`;
  }).join('');
  let xml = strFromU8(parts['word/document.xml']).replace('__TAILORCV_BODY__', paragraphs);
  if (resume.paperSize === 'Letter') xml = xml.replace('<w:pgSz w:w="11909" w:h="16834"/>', '<w:pgSz w:w="12240" w:h="15840"/>');
  parts['word/document.xml'] = strToU8(xml);
  parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']).replace('</Relationships>', `${relationships.join('')}</Relationships>`));
  return zipSync(parts);
}
