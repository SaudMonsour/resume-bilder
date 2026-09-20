import { analyzeJobDescription as analyzeDeterministically } from '@/lib/domain/job-analysis';
import { createId } from '@/lib/domain/ids';
import { compareResumeToJob as compareDeterministically } from '@/lib/domain/matching';
import { parseResumeText } from '@/lib/domain/resume-parser';
import { buildTailoringPlan, validateSuggestion } from '@/lib/domain/tailoring';
import {
  jobAnalysisSchema,
  type JobAnalysis,
  type MasterProfile,
  type MatchAnalysis,
  type ResumeVersion,
  type TailoringSuggestion,
} from '@/lib/domain/schema';

export interface AIService {
  parseResume(text: string): Promise<MasterProfile>;
  analyzeJobDescription(description: string, jobTitle?: string): Promise<JobAnalysis>;
  compareResumeToJob(profile: MasterProfile, analysis: JobAnalysis): Promise<MatchAnalysis>;
  generateTailoredResume(profile: MasterProfile, analysis: JobAnalysis, match: MatchAnalysis): Promise<{ resume: ResumeVersion; suggestions: TailoringSuggestion[] }>;
  improveBullet(profile: MasterProfile, text: string, requirementLabels: string[]): Promise<TailoringSuggestion | null>;
  generateSummary(profile: MasterProfile, requirementLabels: string[]): Promise<TailoringSuggestion | null>;
  generateCoverLetter(profile: MasterProfile, company: string, jobTitle: string, description: string): Promise<string>;
}

const SAFETY_INSTRUCTIONS = `You are an expert resume writer and ATS optimization assistant.
Your primary responsibility is to improve the relevance, clarity, and presentation of the candidate's REAL experience.
Never invent qualifications, experience, technologies, metrics, employers, projects, education, certifications, or achievements.
Every claim must be traceable to the supplied Master Career Profile. When a requirement is unsupported, identify it as a gap instead of adding it.`;

export class DeterministicAIService implements AIService {
  async parseResume(text: string) {
    return parseResumeText(text);
  }

  async analyzeJobDescription(description: string, jobTitle = '') {
    return analyzeDeterministically(description, jobTitle);
  }

  async compareResumeToJob(profile: MasterProfile, analysis: JobAnalysis) {
    return compareDeterministically(profile, analysis);
  }

  async generateTailoredResume(profile: MasterProfile, analysis: JobAnalysis, match: MatchAnalysis) {
    return buildTailoringPlan(profile, analysis, match);
  }

  async improveBullet(profile: MasterProfile, text: string, requirementLabels: string[]) {
    const plan = buildTailoringPlan(profile, analyzeDeterministically(requirementLabels.join('\n')), compareDeterministically(profile, analyzeDeterministically(requirementLabels.join('\n'))));
    return plan.suggestions.find((suggestion) => suggestion.original === text) ?? null;
  }

  async generateSummary() {
    return null;
  }

  async generateCoverLetter(profile: MasterProfile, company: string, jobTitle: string, _description = '') {
    const name = profile.personal.fullName || 'Candidate';
    const supportedSkills = profile.skills.slice(0, 5).map((skill) => skill.name).join(', ');
    const evidence = profile.summary || (supportedSkills ? `My background includes ${supportedSkills}.` : 'My background is detailed in the attached resume.');
    return `Dear Hiring Team at ${company || 'the company'},\n\nI am applying for the ${jobTitle || 'open position'} role. ${evidence}\n\nI would welcome the opportunity to discuss how my documented experience could support your team. Thank you for your consideration.\n\nSincerely,\n${name}`;
  }
}

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export class OpenAIResumeService extends DeterministicAIService {
  constructor(private readonly apiKey: string, private readonly model: string) {
    super();
  }

  private async structuredResponse<T>(name: string, schema: Record<string, unknown>, input: string): Promise<T> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: SAFETY_INSTRUCTIONS,
        input,
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    const result = (await response.json()) as OpenAIResponse;
    const outputText = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!outputText) throw new Error('OpenAI returned no structured output.');
    return JSON.parse(outputText) as T;
  }

  async analyzeJobDescription(description: string, jobTitle = ''): Promise<JobAnalysis> {
    const baseline = analyzeDeterministically(description, jobTitle);
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['jobTitle', 'seniority', 'roleCategory', 'requirements', 'atsKeywords', 'responsibilities', 'educationRequirements', 'certificationRequirements', 'yearsOfExperience', 'softSkills', 'domainKeywords'],
      properties: {
        jobTitle: { type: 'string' }, seniority: { type: 'string' }, roleCategory: { type: 'string' },
        requirements: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'category', 'importance', 'evidenceText'], properties: {
          label: { type: 'string' }, category: { type: 'string', enum: ['technical', 'experience', 'education', 'certification', 'responsibility', 'soft-skill', 'domain'] }, importance: { type: 'string', enum: ['critical', 'important', 'nice-to-have'] }, evidenceText: { type: 'string' },
        } } },
        atsKeywords: { type: 'array', items: { type: 'string' } }, responsibilities: { type: 'array', items: { type: 'string' } }, educationRequirements: { type: 'array', items: { type: 'string' } }, certificationRequirements: { type: 'array', items: { type: 'string' } }, yearsOfExperience: { type: 'array', items: { type: 'string' } }, softSkills: { type: 'array', items: { type: 'string' } }, domainKeywords: { type: 'array', items: { type: 'string' } },
      },
    };
    try {
      const result = await this.structuredResponse<Omit<JobAnalysis, 'requirements'> & { requirements: Array<Omit<JobAnalysis['requirements'][number], 'id'>> }>('job_description_analysis', schema, `Provided job title: ${jobTitle}\n\nJob description:\n${description}`);
      return jobAnalysisSchema.parse({ ...result, requirements: result.requirements.map((item) => ({ ...item, id: createId('req') })) });
    } catch {
      return baseline;
    }
  }

  async generateCoverLetter(profile: MasterProfile, company: string, jobTitle: string, description: string): Promise<string> {
    const schema = { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string' } } };
    try {
      const result = await this.structuredResponse<{ content: string }>('cover_letter', schema, `Company: ${company}\nRole: ${jobTitle}\nJob description: ${description}\n\nMaster Career Profile JSON:\n${JSON.stringify(profile)}`);
      const numbers = result.content.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
      const corpusNumbers = new Set(JSON.stringify(profile).match(/\b\d+(?:\.\d+)?%?\b/g) ?? []);
      if (!numbers.every((value) => corpusNumbers.has(value))) throw new Error('Unsupported metric in cover letter.');
      return result.content;
    } catch {
      return super.generateCoverLetter(profile, company, jobTitle, description);
    }
  }
}

export function createAIService(apiKey?: string, model = 'gpt-5.4-mini'): AIService {
  return apiKey ? new OpenAIResumeService(apiKey, model) : new DeterministicAIService();
}

export { SAFETY_INSTRUCTIONS, validateSuggestion };
