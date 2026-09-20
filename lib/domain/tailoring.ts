import { createId } from './ids.ts';
import { profileEvidenceCorpus } from './matching.ts';
import {
  profileToResume,
  tailoringSuggestionSchema,
  type JobAnalysis,
  type MasterProfile,
  type MatchAnalysis,
  type ResumeVersion,
  type TailoringSuggestion,
} from './schema.ts';

function conservativeRewrite(text: string): string {
  return text
    .replace(/^Responsible for creating\s+/i, 'Created ')
    .replace(/^Responsible for developing\s+/i, 'Developed ')
    .replace(/^Responsible for building\s+/i, 'Built ')
    .replace(/^Responsible for managing\s+/i, 'Managed ')
    .replace(/^Responsible for analyzing\s+/i, 'Analyzed ')
    .replace(/^Responsible for implementing\s+/i, 'Implemented ')
    .replace(/^Responsible for\s+/i, '')
    .replace(/^Worked on\s+/i, 'Contributed to ')
    .replace(/^Helped (?:to )?/i, 'Supported ')
    .replace(/^Was responsible for\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateSuggestion(profile: MasterProfile, suggestion: TailoringSuggestion): TailoringSuggestion {
  const corpus = profileEvidenceCorpus(profile).toLowerCase();
  const sourcePresent = corpus.includes(suggestion.sourceReference.excerpt.toLowerCase());
  const sourceNumbers = new Set(suggestion.sourceReference.excerpt.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []);
  const suggestedNumbers = suggestion.suggested.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersSupported = suggestedNumbers.every((value) => sourceNumbers.has(value));
  return tailoringSuggestionSchema.parse({
    ...suggestion,
    validationStatus: sourcePresent && numbersSupported ? 'verified' : 'review',
  });
}

export function buildTailoringPlan(
  profile: MasterProfile,
  job: JobAnalysis,
  match: MatchAnalysis,
): { resume: ResumeVersion; suggestions: TailoringSuggestion[] } {
  const resume = profileToResume(profile);
  const priority = new Map(
    match.items
      .filter((item) => item.status !== 'missing')
      .map((item, index) => [item.label.toLowerCase(), match.items.length - index]),
  );
  resume.skills = [...resume.skills].sort(
    (a, b) => (priority.get(b.name.toLowerCase()) ?? 0) - (priority.get(a.name.toLowerCase()) ?? 0),
  );
  resume.projects = [...resume.projects].sort((a, b) => {
    const score = (project: typeof a) => job.atsKeywords.filter((keyword) =>
      [project.name, project.description, ...project.technologies, ...project.achievements.map((item) => item.text)]
        .join(' ')
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    ).length;
    return score(b) - score(a);
  });

  const suggestions: TailoringSuggestion[] = [];
  for (const experience of profile.experiences) {
    for (const bullet of experience.bullets) {
      const suggested = conservativeRewrite(bullet.text);
      if (suggested === bullet.text || !suggested) continue;
      suggestions.push(validateSuggestion(profile, {
        id: createId('suggestion'),
        section: 'experience',
        original: bullet.text,
        suggested,
        reason: 'Uses a direct action-led construction without adding facts, technologies, or metrics.',
        sourceReference: {
          type: 'experience',
          entityId: experience.id,
          field: `bullet:${bullet.id}`,
          excerpt: bullet.text,
        },
        status: 'pending',
        validationStatus: 'verified',
      }));
    }
  }

  if (profile.skills.length > 1 && resume.skills.map((item) => item.id).join() !== profile.skills.map((item) => item.id).join()) {
    const original = profile.skills.map((item) => item.name).join(' · ');
    suggestions.unshift(validateSuggestion(profile, {
      id: createId('suggestion'),
      section: 'skills',
      original,
      suggested: resume.skills.map((item) => item.name).join(' · '),
      reason: 'Reorders only confirmed master-profile skills to lead with requirements supported by evidence.',
      sourceReference: {
        type: 'skill',
        entityId: profile.skills[0].id,
        field: 'skills',
        excerpt: profile.skills[0].name,
      },
      status: 'pending',
      validationStatus: 'verified',
    }));
  }

  return { resume, suggestions };
}

export function applySuggestion(resume: ResumeVersion, suggestion: TailoringSuggestion): ResumeVersion {
  const next = structuredClone(resume);
  if (suggestion.section === 'summary' && next.summary === suggestion.original) next.summary = suggestion.suggested;
  if (suggestion.section === 'skills') {
    const order = suggestion.suggested.split('·').map((item) => item.trim().toLowerCase());
    next.skills.sort((a, b) => order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase()));
  }
  if (suggestion.section === 'experience') {
    for (const experience of next.experiences) {
      const bullet = experience.bullets.find((item) => item.text === suggestion.original);
      if (bullet) bullet.text = suggestion.suggested;
    }
  }
  if (suggestion.section === 'projects') {
    for (const project of next.projects) {
      const achievement = project.achievements.find((item) => item.text === suggestion.original);
      if (achievement) achievement.text = suggestion.suggested;
    }
  }
  return next;
}

export function applyVerifiedSuggestions(
  resume: ResumeVersion,
  suggestions: TailoringSuggestion[],
): { resume: ResumeVersion; suggestions: TailoringSuggestion[]; appliedCount: number } {
  let nextResume = structuredClone(resume);
  let appliedCount = 0;
  const nextSuggestions = suggestions.map((suggestion) => {
    if (suggestion.validationStatus !== 'verified') return suggestion;
    const accepted: TailoringSuggestion = { ...suggestion, status: 'accepted' };
    nextResume = applySuggestion(nextResume, accepted);
    appliedCount += 1;
    return accepted;
  });
  return { resume: nextResume, suggestions: nextSuggestions, appliedCount };
}
