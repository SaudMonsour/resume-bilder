import type { JobAnalysis, MasterProfile, MatchAnalysis, SourceReference } from './schema.ts';

const synonyms: Record<string, string[]> = {
  'data pipelines': ['etl', 'elt', 'data processing', 'data ingestion', 'pipeline'],
  'data visualization': ['dashboard', 'reporting', 'power bi', 'tableau'],
  'stakeholder management': ['stakeholders', 'clients', 'cross-functional'],
  'team leadership': ['mentored', 'managed team', 'led team', 'technical leadership'],
  'machine learning': ['predictive modeling', 'ml model', 'scikit-learn', 'tensorflow', 'pytorch'],
  'rest apis': ['api development', 'restful', 'web api'],
  'ci/cd': ['continuous integration', 'deployment pipeline', 'github actions', 'gitlab ci'],
};

type Evidence = { text: string; reference: SourceReference };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function evidenceFromProfile(profile: MasterProfile): Evidence[] {
  const evidence: Evidence[] = [];
  if (profile.summary) {
    evidence.push({
      text: profile.summary,
      reference: { type: 'summary', entityId: profile.id, field: 'summary', excerpt: profile.summary },
    });
  }
  for (const skill of profile.skills) {
    evidence.push({
      text: skill.name,
      reference: { type: 'skill', entityId: skill.id, field: 'name', excerpt: skill.name },
    });
  }
  for (const experience of profile.experiences) {
    const combined = [experience.jobTitle, experience.company, experience.description, ...experience.technologies].filter(Boolean).join(' · ');
    if (combined) evidence.push({ text: combined, reference: { type: 'experience', entityId: experience.id, field: 'overview', excerpt: combined } });
    for (const bullet of experience.bullets) {
      evidence.push({ text: bullet.text, reference: { type: 'experience', entityId: experience.id, field: `bullet:${bullet.id}`, excerpt: bullet.text } });
    }
  }
  for (const project of profile.projects) {
    const overview = [project.name, project.description, ...project.technologies].filter(Boolean).join(' · ');
    if (overview) evidence.push({ text: overview, reference: { type: 'project', entityId: project.id, field: 'overview', excerpt: overview } });
    for (const bullet of project.achievements) {
      evidence.push({ text: bullet.text, reference: { type: 'project', entityId: project.id, field: `bullet:${bullet.id}`, excerpt: bullet.text } });
    }
  }
  for (const education of profile.education) {
    const text = [education.qualification, education.institution, education.details].filter(Boolean).join(' · ');
    if (text) evidence.push({ text, reference: { type: 'education', entityId: education.id, field: 'details', excerpt: text } });
  }
  for (const certification of profile.certifications) {
    const text = [certification.name, certification.issuer].filter(Boolean).join(' · ');
    if (text) evidence.push({ text, reference: { type: 'certification', entityId: certification.id, field: 'name', excerpt: text } });
  }
  return evidence;
}

function findEvidence(label: string, evidence: Evidence[]): { status: 'strong' | 'partial' | 'missing'; matches: Evidence[] } {
  const normalizedLabel = normalize(label);
  const contains = (text: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(normalize(text));
  const strong = evidence.filter((item) => contains(item.text, normalizedLabel));
  if (strong.length) return { status: 'strong', matches: strong.slice(0, 3) };
  const related = synonyms[normalizedLabel] ?? [];
  const partial = evidence.filter((item) => related.some((phrase) => normalize(item.text).includes(normalize(phrase))));
  return partial.length ? { status: 'partial', matches: partial.slice(0, 3) } : { status: 'missing', matches: [] };
}

function weightedScore(items: MatchAnalysis['items']): number {
  if (!items.length) return 0;
  const importanceWeight = { critical: 3, important: 2, 'nice-to-have': 1 } as const;
  const statusValue = { strong: 1, partial: 0.55, missing: 0 } as const;
  const max = items.reduce((sum, item) => sum + importanceWeight[item.importance], 0);
  const earned = items.reduce((sum, item) => sum + importanceWeight[item.importance] * statusValue[item.status], 0);
  return Math.round((earned / max) * 100);
}

export function compareResumeToJob(profile: MasterProfile, job: JobAnalysis): MatchAnalysis {
  const evidence = evidenceFromProfile(profile);
  const items: MatchAnalysis['items'] = job.requirements.map((requirement) => {
    const found = findEvidence(requirement.label, evidence);
    return {
      requirementId: requirement.id,
      label: requirement.label,
      category: requirement.category,
      importance: requirement.importance,
      status: found.status,
      explanation:
        found.status === 'strong'
          ? 'Direct evidence appears in the master profile.'
          : found.status === 'partial'
            ? 'Related evidence exists, but the requirement is not stated directly.'
            : 'No supporting evidence was found. TailorCV will not add this claim.',
      sourceReferences: found.matches.map((item) => item.reference),
    };
  });

  const categories: Record<keyof MatchAnalysis['breakdown'], MatchAnalysis['items']> = {
    technicalSkills: items.filter((item) => item.category === 'technical'),
    experience: items.filter((item) => item.category === 'experience'),
    education: items.filter((item) => item.category === 'education'),
    certifications: items.filter((item) => item.category === 'certification'),
    responsibilities: items.filter((item) => item.category === 'responsibility' || item.category === 'soft-skill' || item.category === 'domain'),
    atsKeywords: items,
  };

  return {
    overallScore: weightedScore(items),
    scoreLabel: 'Internal relevance estimate',
    breakdown: Object.fromEntries(
      Object.entries(categories).map(([key, categoryItems]) => [key, weightedScore(categoryItems)]),
    ) as MatchAnalysis['breakdown'],
    items,
  };
}

export function profileEvidenceCorpus(profile: MasterProfile): string {
  return evidenceFromProfile(profile).map((item) => item.text).join('\n');
}
