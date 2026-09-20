import type { ResumeVersion } from '../domain/schema.ts';

export type Run = { text: string; bold?: boolean; italic?: boolean; href?: string; size?: number };
export type Role = 'name' | 'headline' | 'contact' | 'links' | 'linkedin' | 'heading' | 'body' | 'skill' | 'entry' | 'subline' | 'bullet' | 'institution' | 'detail' | 'certification' | 'languages';
export type ResumeBlock = { role: Role; runs: Run[]; right?: string };

// Measurements come from the user's retained DOCX, not from the AI response.
export const PAGE = { width: 11909 / 20, height: 16834 / 20, left: 893 / 20, right: 893 / 20, top: 936 / 20, bottom: 36 };
export const FORMATS: Record<Role, { size: number; before: number; after: number; line: number; bold?: boolean; italic?: boolean; tracking?: number; keepNext?: boolean }> = {
  name: { size: 27, before: 0, after: 1, line: 1, bold: true, tracking: .25, keepNext: true },
  headline: { size: 11.5, before: 0, after: 5, line: 259 / 240, tracking: .75, keepNext: true },
  contact: { size: 9.5, before: 0, after: 2, line: 259 / 240, keepNext: true },
  links: { size: 9.5, before: 0, after: 1, line: 259 / 240, keepNext: true },
  linkedin: { size: 9.5, before: 0, after: 1, line: 259 / 240, keepNext: true },
  heading: { size: 11, before: 13, after: 4, line: 259 / 240, bold: true, keepNext: true },
  body: { size: 11, before: 0, after: 3, line: 259 / 240 },
  skill: { size: 11, before: 0, after: 2, line: 259 / 240 },
  entry: { size: 10.5, before: 0, after: 3, line: 259 / 240, bold: true, keepNext: true },
  subline: { size: 11, before: 0, after: 4, line: 259 / 240, italic: true, keepNext: true },
  bullet: { size: 11, before: 0, after: 3, line: 259 / 240 },
  institution: { size: 11, before: 0, after: 1, line: 259 / 240 },
  detail: { size: 11, before: 0, after: 1, line: 259 / 240 },
  certification: { size: 11, before: 0, after: 2, line: 259 / 240 },
  languages: { size: 11, before: 7, after: 0, line: 259 / 240 },
};

export function safeLink(value: string, email = false): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /[<>\s]/.test(trimmed)) return undefined;
  if (email) return /^[^@]+@[^@]+\.[^@]+$/.test(trimmed) ? `mailto:${trimmed}` : undefined;
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : /^(?:www\.|[\w-]+\.[\w-]+)/.test(trimmed) ? `https://${trimmed}` : '';
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}

function link(value: string, email = false): Run { return { text: email ? value : value.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, ''), href: safeLink(value, email) }; }
function joinRuns(runs: Run[], separator = '  |  '): Run[] { return runs.filter(r => r.text.trim()).flatMap((r, i) => i ? [{ text: separator }, r] : [r]); }
export function resumeBlocks(resume: ResumeVersion): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  const add = (role: Role, runs: Run[], right?: string) => { if (runs.some(r => r.text.trim())) blocks.push({ role, runs, right }); };
  const text = (role: Role, value: string, right?: string) => add(role, [{ text: value }], right);
  const p = resume.personal;
  text('name', p.fullName.toUpperCase());
  text('headline', p.professionalTitle.toUpperCase());
  add('contact', joinRuns([{ text: p.location }, { text: p.phone }, link(p.email, true)]));
  add('links', joinRuns([link(p.portfolio), link(p.github)]));
  add('linkedin', [link(p.linkedIn)]);
  const heading = (value: string) => text('heading', value.toUpperCase());
  for (const section of new Set(resume.sectionOrder)) {
    if (resume.hiddenSections.includes(section)) continue;
    if (section === 'summary' && resume.summary.trim()) { heading('Professional Summary'); text('body', resume.summary); }
    if (section === 'skills' && resume.skills.length) {
      heading('Technical Skills');
      const groups = new Map<string, string[]>();
      for (const skill of resume.skills) { const category = skill.category && skill.category !== 'General' ? skill.category : 'Technical Skills'; groups.set(category, [...(groups.get(category) ?? []), skill.name]); }
      for (const [category, names] of groups) add('skill', [{ text: `${category}: `, bold: true }, { text: names.join(', ') }]);
    }
    if (section === 'experience' && resume.experiences.length) {
      heading('Professional Experience');
      for (const item of resume.experiences) {
        text('entry', item.company || item.jobTitle, [item.startDate, item.endDate].filter(Boolean).join(' - '));
        if (item.company) text('subline', item.jobTitle);
        text('body', item.description);
        for (const bullet of item.bullets) text('bullet', bullet.text);
      }
    }
    if (section === 'projects' && resume.projects.length) {
      heading('Selected Projects');
      for (const item of resume.projects) {
        add('entry', [{ text: item.name, bold: true }, ...(item.url ? [{ text: ' | ' }, { ...link(item.url), bold: false, size: 9.5 }] : [])]);
        text('subline', item.technologies.join(', '));
        text('body', item.description);
        for (const bullet of item.achievements) text('bullet', bullet.text);
      }
    }
    if (section === 'education' && resume.education.length) {
      heading('Education');
      for (const item of resume.education) {
        text('entry', item.qualification, [item.startDate, item.endDate].filter(Boolean).join(' - '));
        text('institution', item.institution);
        if (item.details && item.details !== item.qualification) add('detail', [{ text: item.details, bold: /^GPA\b/i.test(item.details) }]);
      }
    }
    if (section === 'certifications' && resume.certifications.length) {
      heading('Certifications');
      for (const item of resume.certifications) add('certification', [{ text: item.name, bold: true, href: item.url ? safeLink(item.url) : undefined, size: item.url ? 10.5 : undefined }, ...(item.issuer || item.date ? [{ text: ` | ${[item.issuer, item.date].filter(Boolean).join(' - ')}` }] : [])]);
    }
    if (section === 'languages' && resume.languages.length) add('languages', [{ text: 'LANGUAGES  ', bold: true }, { text: resume.languages.join('  |  ') }]);
  }
  return blocks;
}

export function validateExport(resume: ResumeVersion) {
  const blocks = resumeBlocks(resume);
  if (!resume.personal.fullName.trim() || !blocks.some(b => !['name', 'headline', 'contact', 'links', 'linkedin', 'heading', 'languages'].includes(b.role))) throw new Error('This CV is incomplete. Add your name and career information before downloading.');
  return blocks;
}
