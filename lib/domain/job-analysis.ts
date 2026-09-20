import { createId } from './ids.ts';
import { jobAnalysisSchema, type JobAnalysis } from './schema.ts';

type CatalogEntry = { label: string; patterns: string[]; category: JobAnalysis['requirements'][number]['category'] };

const catalog: CatalogEntry[] = [
  { label: 'Python', patterns: ['python'], category: 'technical' },
  { label: 'Java', patterns: ['java'], category: 'technical' },
  { label: 'Go', patterns: ['go'], category: 'technical' },
  { label: 'Relational databases', patterns: ['relational database', 'relational databases'], category: 'technical' },
  { label: 'Microservices', patterns: ['microservice', 'microservices'], category: 'technical' },
  { label: 'Data structures & algorithms', patterns: ['data structures', 'algorithms'], category: 'technical' },
  { label: 'System design', patterns: ['system design'], category: 'technical' },
  { label: 'Unit testing', patterns: ['unit testing', 'unit tests'], category: 'technical' },
  { label: 'JavaScript', patterns: ['javascript', 'js'], category: 'technical' },
  { label: 'TypeScript', patterns: ['typescript'], category: 'technical' },
  { label: 'React', patterns: ['react', 'react.js'], category: 'technical' },
  { label: 'Next.js', patterns: ['next.js', 'nextjs'], category: 'technical' },
  { label: 'SQL', patterns: ['sql'], category: 'technical' },
  { label: 'Power BI', patterns: ['power bi', 'powerbi'], category: 'technical' },
  { label: 'Tableau', patterns: ['tableau'], category: 'technical' },
  { label: 'Excel', patterns: ['excel'], category: 'technical' },
  { label: 'AWS', patterns: ['aws', 'amazon web services'], category: 'technical' },
  { label: 'Azure', patterns: ['azure'], category: 'technical' },
  { label: 'Google Cloud', patterns: ['google cloud', 'gcp'], category: 'technical' },
  { label: 'Machine Learning', patterns: ['machine learning', 'ml models'], category: 'technical' },
  { label: 'Docker', patterns: ['docker'], category: 'technical' },
  { label: 'Kubernetes', patterns: ['kubernetes', 'k8s'], category: 'technical' },
  { label: 'Terraform', patterns: ['terraform'], category: 'technical' },
  { label: 'Git', patterns: ['git', 'github', 'gitlab'], category: 'technical' },
  { label: 'Data pipelines', patterns: ['data pipeline', 'data pipelines', 'etl', 'elt'], category: 'domain' },
  { label: 'Data visualization', patterns: ['data visualization', 'dashboards'], category: 'domain' },
  { label: 'Stakeholder management', patterns: ['stakeholder management', 'stakeholders'], category: 'soft-skill' },
  { label: 'Communication', patterns: ['communication skills', 'communicate'], category: 'soft-skill' },
  { label: 'Team leadership', patterns: ['team leadership', 'lead a team', 'people management'], category: 'soft-skill' },
  { label: 'Agile', patterns: ['agile', 'scrum'], category: 'domain' },
  { label: 'REST APIs', patterns: ['rest api', 'restful'], category: 'technical' },
  { label: 'Node.js', patterns: ['node.js', 'nodejs'], category: 'technical' },
  { label: 'PostgreSQL', patterns: ['postgresql', 'postgres'], category: 'technical' },
  { label: 'CI/CD', patterns: ['ci/cd', 'continuous integration'], category: 'technical' },
];

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function importanceFor(context: string): 'critical' | 'important' | 'nice-to-have' {
  if (/\b(required|must|essential|minimum|mandatory)\b/i.test(context)) return 'critical';
  if (/\b(preferred|plus|bonus|nice to have|desirable)\b/i.test(context)) return 'nice-to-have';
  return 'important';
}

export function analyzeJobDescription(description: string, suppliedTitle = ''): JobAnalysis {
  const lines = description
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const requirements = catalog.flatMap((entry) => {
    const evidenceText = lines.find((line) => entry.patterns.some((pattern) => containsPhrase(line, pattern)));
    if (!evidenceText) return [];
    return [{
      id: createId('req'),
      label: entry.label,
      category: entry.category,
      importance: importanceFor(evidenceText),
      evidenceText,
    }];
  });
  const responsibilityLines = lines
    .filter((line) => /^(?:[-•*]\s*)?(?:develop|build|design|lead|manage|analy[sz]e|create|implement|support|own|collaborate|deliver|maintain)/i.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/^[-•*]\s*/, ''));
  const educationRequirements = lines.filter((line) => /\b(bachelor|master'?s|degree|phd|education)\b/i.test(line)).slice(0, 4);
  const certificationRequirements = lines.filter((line) => /\b(certification|certified|certificate)\b/i.test(line)).slice(0, 4);
  const yearsOfExperience = lines.filter((line) => /\b\d+\+?\s*(?:years?|yrs?)\b/i.test(line)).slice(0, 4);
  const lower = description.toLowerCase();
  const seniority = /\b(principal|staff)\b/.test(lower)
    ? 'Staff / Principal'
    : /\b(senior|sr\.)\b/.test(lower)
      ? 'Senior'
      : /\b(junior|entry.level|graduate)\b/.test(lower)
        ? 'Entry level'
        : 'Not specified';
  const inferredTitle = (suppliedTitle || lines.find((line) => /engineer|developer|analyst|designer|manager|specialist|scientist/i.test(line)) || '').replace(/[*#]/g, '').trim();
  const roleCategory = /data|machine learning|analytics/i.test(inferredTitle)
    ? 'Data & AI'
    : /software|developer|engineer|frontend|backend|full.stack/i.test(`${inferredTitle} ${description}`)
      ? 'Software Engineering'
      : /product|design|ux|ui/i.test(`${inferredTitle} ${description}`)
        ? 'Product & Design'
        : 'General';

  return jobAnalysisSchema.parse({
    jobTitle: inferredTitle,
    seniority,
    roleCategory,
    requirements,
    atsKeywords: requirements.map((item) => item.label),
    responsibilities: responsibilityLines,
    educationRequirements,
    certificationRequirements,
    yearsOfExperience,
    softSkills: requirements.filter((item) => item.category === 'soft-skill').map((item) => item.label),
    domainKeywords: requirements.filter((item) => item.category === 'domain').map((item) => item.label),
  });
}
