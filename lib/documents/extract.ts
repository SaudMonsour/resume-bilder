import { unzipSync } from 'fflate';
import { extractText as extractPdfText } from 'unpdf';

function decodeXml(value: string): string {
  return value
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractResumeText(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    const result = await extractPdfText(bytes, { mergePages: true });
    return result.text.trim();
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')) {
    const files = unzipSync(bytes);
    const documentXml = files['word/document.xml'];
    if (!documentXml) throw new Error('The DOCX file does not contain a readable document body.');
    let xml = new TextDecoder().decode(documentXml);
    const relationships = new TextDecoder().decode(files['word/_rels/document.xml.rels'] ?? new Uint8Array());
    const links = new Map<string, string>();
    for (const match of relationships.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = match[0].match(/\bId="([^"]+)"/)?.[1];
      const target = match[0].match(/\bTarget="([^"]+)"/)?.[1];
      if (id && target && /\/hyperlink"/.test(match[0]) && /^(https?:\/\/|mailto:)/i.test(target)) links.set(id, target);
    }
    // Retain source-backed credential/project links next to their labels.
    xml = xml.replace(/<w:hyperlink\b[^>]*r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g, (original, id: string, content: string) => {
      const target = links.get(id);
      if (!target || target.replace(/^https?:\/\/(www\.)?|^mailto:/i, '').replace(/\/$/, '') === decodeXml(content).replace(/\/$/, '')) return original;
      return `${content}<w:r><w:t> (${target})</w:t></w:r>`;
    });
    return decodeXml(xml);
  }
  if (mimeType.startsWith('text/') || lowerName.endsWith('.txt')) {
    return new TextDecoder().decode(bytes).trim();
  }
  throw new Error('Unsupported file type. Upload PDF, DOCX, or TXT.');
}
