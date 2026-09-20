import { createId } from './ids.ts';
import { masterProfileSchema, type MasterProfile } from './schema.ts';

const sectionAliases: Record<string, string[]> = {
  summary: ['professional summary', 'summary', 'profile', 'objective', 'about'],
  skills: ['technical skills', 'skills', 'core competencies', 'technologies'],
  experience: ['professional experience', 'work experience', 'experience', 'employment'],
  projects: ['selected projects', 'personal projects', 'projects', 'professional portfolio'],
  education: ['education', 'academic background'],
  certifications: ['certifications', 'certificates', 'licenses'], languages: ['languages'],
};
const isBullet = (line: string) => /^\s*[•●▪◦‣*-]\s+/.test(line);
const clean = (line: string) => line.replace(/^\s*[•●▪◦‣*-]\s+/, '').trim();
const action = /^(built|developed|created|contributed|supported|managed|implemented|designed|analy[sz]ed|reconciled|automated|worked|responsible|helped|led|optimized|deployed|integrated|tested)\b/i;
const date = '(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+)?(?:19|20)\\d{2}';
const range = new RegExp(`(${date})\\s*[-–—]\\s*(${date}|Present|Current)`, 'i');
const trailingDate = new RegExp(`\\s+(${date})$`, 'i');
function splitDate(line: string) {
  const found = line.match(range);
  if (found) return { text: line.replace(found[0], '').replace(/[|\s]+$/, '').trim(), startDate: found[1], endDate: found[2] };
  const single = line.match(trailingDate);
  return { text: single ? line.slice(0, single.index).trim() : line, startDate: '', endDate: single?.[1] ?? '' };
}

export function parseSkills(lines: string[]): MasterProfile['skills'] {
  const skills: MasterProfile['skills'] = [];
  for (const line of lines) {
    const colon = line.indexOf(':');
    const categorized = colon > 0 && colon < 65;
    const category = categorized ? clean(line.slice(0, colon)) : 'General';
    for (const name of (categorized ? line.slice(colon + 1) : line).split(/[,;|•]/).map(clean).filter(Boolean)) {
      if (!skills.some(item => item.name.toLowerCase() === name.toLowerCase())) skills.push({ id: createId('skill'), name, category, confirmedByUser: false });
    }
  }
  return skills;
}

// Keep structure without depending on an AI provider. Ambiguous content remains source text.
export function parseResumeText(text: string): MasterProfile {
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  const buckets: Record<string, string[]> = { preamble: [] };
  let current = 'preamble';
  for (const line of lines) {
    let heading: string | undefined;
    let remainder = '';
    for (const [section, aliases] of Object.entries(sectionAliases)) {
      const alias = aliases.find(value => line.toLowerCase().replace(/[:|]+$/, '') === value || (section === 'languages' && line.toLowerCase().startsWith(value + ' ')));
      if (alias) { heading = section; remainder = line.slice(alias.length).replace(/^[:|\s]+/, ''); break; }
    }
    if (heading) current = heading;
    buckets[current] ??= [];
    if (!heading || remainder) buckets[current].push(heading ? remainder : line);
  }
  const preamble = buckets.preamble ?? [];
  const contact = preamble.join('\n');
  const email = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const phone = contact.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? '';
  const urls = contact.replace(email, '').match(/(?:https?:\/\/|www\.)[^\s|)]+|(?:[a-z0-9-]+\.)+(?:com|io|dev|net|org)(?:\/[^\s|)]+)?/gi) ?? [];
  const toUrl = (url = '') => url ? (/^https?:/i.test(url) ? url : `https://${url}`) : '';
  const linkedIn = urls.find(url => /linkedin\.com/i.test(url));
  const github = urls.find(url => /github\.com/i.test(url));
  const portfolio = urls.find(url => url !== linkedIn && url !== github);
  const locationLine = preamble.find(line => (email && line.includes(email)) || (phone && line.includes(phone)));
  const location = locationLine?.split(/[|•]/).map(s => s.trim()).find(part => part && !part.includes('@') && !/\d/.test(part) && !/https?:|\.com/i.test(part)) ?? '';
  const experiences: MasterProfile['experiences'] = [];
  let experience: MasterProfile['experiences'][number] | undefined;
  for (const line of buckets.experience ?? []) {
    const bullet = isBullet(line) || action.test(line);
    if (!experience || (!bullet && range.test(line) && experience.bullets.length > 0)) {
      experience = { id: createId('exp'), company: '', jobTitle: '', startDate: '', endDate: '', description: '', bullets: [], technologies: [] };
      experiences.push(experience);
    }
    if (bullet) experience.bullets.push({ id: createId('bullet'), text: clean(line) });
    else if (!experience.company) Object.assign(experience, { company: splitDate(line).text, startDate: splitDate(line).startDate, endDate: splitDate(line).endDate });
    else if (!experience.jobTitle && !experience.bullets.length) experience.jobTitle = line;
    else if (experience.bullets.length) experience.bullets[experience.bullets.length - 1].text += ` ${line}`;
    else experience.description = [experience.description, line].filter(Boolean).join(' ');
  }
  const education: MasterProfile['education'] = [];
  for (const line of buckets.education ?? []) {
    const degree = /\b(bachelor|master|bsc|msc|bs\b|ms\b|ph\.?d|diploma|associate|b\.?s\.?c)/i.test(line);
    let item = education.at(-1);
    if (!item || (degree && item.qualification)) {
      item = { id: createId('edu'), institution: '', qualification: '', startDate: '', endDate: '', details: '' };
      education.push(item);
    }
    const parts = splitDate(line);
    if (degree) item.qualification = parts.text;
    else if (!item.institution && !/^(GPA|grade|coursework|honors)\b/i.test(line)) item.institution = parts.text;
    else item.details = [item.details, clean(line)].filter(Boolean).join('\n');
    if (parts.endDate) { item.startDate = parts.startDate; item.endDate = parts.endDate; }
  }
  const certifications = (buckets.certifications ?? []).map(line => {
    const url = line.match(/https?:\/\/[^\s)]+/i)?.[0] ?? '';
    const [name, ...rest] = clean(line.replace(/\(https?:\/\/[^)]+\)/g, '')).split(/\s*\|\s*/);
    const issuerText = rest.join(' | ');
    const year = issuerText.match(/\s*[-–—]\s*((?:19|20)\d{2})$/);
    return { id: createId('cert'), name, issuer: year ? issuerText.slice(0, year.index).trim() : issuerText, date: year?.[1] ?? '', url };
  });
  const projects: MasterProfile['projects'] = [];
  for (const line of buckets.projects ?? []) {
    if (!projects.length || (!isBullet(line) && !action.test(line) && projects.at(-1)!.achievements.length)) projects.push({ id: createId('project'), name: '', description: '', technologies: [], achievements: [], url: '' });
    const project = projects.at(-1)!;
    if (!project.name && !isBullet(line) && !action.test(line)) {
      project.url = line.match(/https?:\/\/[^\s)]+/)?.[0] ?? '';
      project.name = line.replace(/\s*\(?https?:\/\/[^\s)]+\)?/, '').replace(/[|\s]+$/, '');
    } else project.achievements.push({ id: createId('bullet'), text: clean(line) });
  }
  return masterProfileSchema.parse({
    id: 'master', personal: {
      fullName: preamble[0] ?? '',
      professionalTitle: preamble.slice(1).find(line => !line.includes('@') && line !== locationLine && !/https?:|\.com|www\.|\+?\d[\d\s-]{7,}/i.test(line)) ?? '',
      email, phone, location, linkedIn: toUrl(linkedIn), github: toUrl(github), portfolio: toUrl(portfolio),
    },
    summary: (buckets.summary ?? []).join(' '), skills: parseSkills(buckets.skills ?? []),
    experiences, projects, education, certifications,
    languages: (buckets.languages ?? []).flatMap(line => line.split(/[|,;]/)).map(clean).filter(Boolean),
    other: [], sourceText: text.trim(), updatedAt: new Date().toISOString(),
  });
}
