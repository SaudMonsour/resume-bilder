import { z } from 'zod';
import { createId } from '../domain/ids.ts';
import { profileToResume, type JobAnalysis, type MasterProfile, type MatchAnalysis, type TailoringSuggestion } from '../domain/schema.ts';
import { validateSuggestion } from '../domain/tailoring.ts';

export const DEFAULT_OPENROUTER_AGENT_MODEL = 'minimax/minimax-m3:free';
export const DEFAULT_OPENROUTER_WRITING_MODEL = 'z-ai/glm-5.2:free';

export type OpenRouterConfig = {
  apiKey: string;
  agentModel?: string;
  writingModel?: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
};

const agentPlanSchema = z.object({
  targetTitle: z.string().default(''),
  focusTerms: z.array(z.string()).default([]),
  prioritySkillIds: z.array(z.string()).default([]),
  priorityBulletIds: z.array(z.string()).default([]),
  priorityExperienceIds: z.array(z.string()).default([]),
  priorityProjectIds: z.array(z.string()).default([]),
  writingBrief: z.union([z.array(z.string()), z.string().transform((value) => value ? [value] : [])]).default([]),
});

const writingResultSchema = z.object({
  headline: z.string().default(''),
  summary: z.string().default(''),
  skillOrder: z.array(z.string()).default([]),
  skillCategories: z.array(z.object({ category: z.string(), skillIds: z.array(z.string()) })).default([]),
  experienceOrder: z.array(z.string()).default([]),
  experiences: z.array(z.object({
    experienceId: z.string(),
    bullets: z.array(z.object({ bulletId: z.string(), text: z.string() })),
  })).default([]),
  projectOrder: z.array(z.string()).default([]),
  projects: z.array(z.object({
    projectId: z.string(),
    achievements: z.array(z.object({ bulletId: z.string(), text: z.string() })),
  })).default([]),
});

const parsedResumeSchema = z.object({
  personal: z.object({
    fullName: z.string().default(''),
    professionalTitle: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().default(''),
    location: z.string().default(''),
    linkedIn: z.string().default(''),
    portfolio: z.string().default(''),
    github: z.string().default(''),
  }).default({ fullName: '', professionalTitle: '', email: '', phone: '', location: '', linkedIn: '', portfolio: '', github: '' }),
  summary: z.string().default(''),
  skills: z.array(z.string()).default([]),
  experiences: z.array(z.object({
    company: z.string().default(''),
    jobTitle: z.string().default(''),
    startDate: z.string().default(''),
    endDate: z.string().default(''),
    description: z.string().default(''),
    bullets: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
  })).default([]),
  projects: z.array(z.object({
    name: z.string().default(''),
    description: z.string().default(''),
    technologies: z.array(z.string()).default([]),
    achievements: z.array(z.string()).default([]),
    url: z.string().default(''),
  })).default([]),
  education: z.array(z.object({
    institution: z.string().default(''),
    qualification: z.string().default(''),
    startDate: z.string().default(''),
    endDate: z.string().default(''),
    details: z.string().default(''),
  })).default([]),
  certifications: z.array(z.object({
    name: z.string().default(''),
    issuer: z.string().default(''),
    date: z.string().default(''),
    url: z.string().default(''),
  })).default([]),
  languages: z.array(z.string()).default([]),
});

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string };
};

export class ResumeProviderError extends Error {
  status: number;
  model: string;
  constructor(status: number, model: string) {
    super(status === 429 ? `OpenRouter's free-model limit was reached for ${model}. Try again after the limit resets.`
      : status === 401 || status === 403 ? 'OpenRouter rejected the API key or access. Check the server configuration.'
      : status === 404 ? `OpenRouter could not find an available endpoint for ${model}.`
      : `OpenRouter could not complete the rewrite with ${model} (HTTP ${status}). Try again later.`);
    this.status = status;
    this.model = model;
  }
}

export function providerFailure(error: unknown): string {
  if (error instanceof ResumeProviderError) return error.message;
  if (error instanceof Error && /timeout|abort/i.test(error.name + error.message)) return 'The writing model timed out. Your original CV is safe; try again.';
  return 'The model did not return a usable, evidence-checked rewrite. Your original CV is safe; try again.';
}

const SYSTEM_SAFETY = 'You are working on a factual resume. Never invent or infer employers, dates, titles, technologies, qualifications, education, certifications, responsibilities, achievements, or metrics. Use only the supplied CV evidence. A job requirement is a relevance target, never proof that the candidate has that experience. Preserve all numbers exactly. Return only the requested JSON object.';

const RESUME_WRITING_STANDARD = `Write as an expert ATS resume specialist for data science, machine learning, AI engineering, data engineering, and technical roles.
The BASE_CV is the only source of truth. Optimize aggressively for the job, never by lying.

Internally prioritize high, medium, and low priority requirements and use only terms supported by the candidate's evidence. A missing requirement must never become a candidate claim.

POSITIONING
- Make the professional identity clear with a truthful target-aligned headline. Never change an employment title.
- Write a concise 2-4 line summary using concrete technical language and 3-6 supported, job-relevant terms.
- Avoid first-person pronouns, generic corporate filler, exaggerated adjectives, buzzwords, and keyword stuffing.

SKILLS
- Organize existing skills into short logical categories such as Programming & Data, Machine Learning, LLMs & NLP, Tools, and Infrastructure.
- Reorder or de-emphasize skills for relevance. Never add a skill because it appears only in the job description.

EXPERIENCE AND PROJECTS
- Prefer ACTION + TECHNICAL WORK + PURPOSE OR IMPACT.
- Use strong, varied verbs such as Developed, Built, Designed, Implemented, Automated, Engineered, Created, Analyzed, Optimized, Integrated, Deployed, or Managed.
- Rewrite weak phrasing without changing facts. Keep bullets concise and technically credible.
- Preserve all employers, employment titles, dates, project names, links, technologies, and real metrics.
- Expand a supported acronym with its standard full term when useful for ATS, for example Retrieval-Augmented Generation (RAG), Natural Language Processing (NLP), Large Language Models (LLMs), Machine Learning (ML), or Application Programming Interface (API).
- For projects, prefer 1-2 concise bullets covering what was built, how it was built, its purpose, and only measured results that already exist.

STRUCTURE
- Use standard ATS sections in this order: Summary, Technical Skills, Professional Experience, Selected Projects, Education, Certifications, Languages.
- Prefer one page for early-career candidates by removing redundancy and low-relevance detail, never by using unreadably small text.
- Preserve GitHub, portfolio, demo, and project links from the BASE_CV. Never invent URLs.
- Keep education, certification names and issuers, and languages factual. Add proficiency only when explicitly present.

Before returning JSON, check truthfulness, job alignment, ATS terminology, concise human writing, technical accuracy, and 10-second recruiter readability.`;

function extractJson(content: string): unknown {
  const cleaned = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('OpenRouter returned an invalid JSON response.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function responseText(payload: OpenRouterResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('');
  throw new Error(payload.error?.message ?? 'OpenRouter returned no content.');
}

async function callOpenRouter(config: OpenRouterConfig, model: string, prompt: string): Promise<unknown> {
  const baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + config.apiKey,
    'Content-Type': 'application/json',
    'X-OpenRouter-Title': config.appName ?? 'TailorCV',
  };
  if (config.siteUrl) headers['HTTP-Referer'] = config.siteUrl;
  const response = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_SAFETY },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 6_000,
      response_format: { type: 'json_object' },
      stream: false,
    }),
  });
  const payload = await response.json() as OpenRouterResponse;
  if (!response.ok) throw new ResumeProviderError(response.status, model);
  return extractJson(responseText(payload));
}

function numbers(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
}

export function hasOnlySupportedNumbers(source: string, candidate: string): boolean {
  const supported = new Set(numbers(source));
  return numbers(candidate).every((value) => supported.has(value));
}

function mentionsUnsupportedRequirement(candidate: string, original: string, match: MatchAnalysis): boolean {
  const normalizedCandidate = normalizedEvidence(candidate);
  const normalizedOriginal = normalizedEvidence(original);
  return match.items.some((item) => {
    if (item.status !== 'missing') return false;
    const label = normalizedEvidence(item.label);
    return label.length > 2 && normalizedCandidate.includes(label) && !normalizedOriginal.includes(label);
  });
}

function safeRewrite(original: string, candidate: string, profile: MasterProfile, match: MatchAnalysis): boolean {
  return hasOnlySupportedNumbers(profile.sourceText || original, candidate)
    && !mentionsUnsupportedRequirement(candidate, original, match);
}

function modelProfile(profile: MasterProfile) {
  return {
    personal: profile.personal,
    summary: profile.summary,
    skills: profile.skills,
    experiences: profile.experiences,
    projects: profile.projects,
    education: profile.education,
    certifications: profile.certifications,
    languages: profile.languages,
  };
}

function normalizedEvidence(value: string): string {
  return value.toLowerCase().replace(/[\u2010-\u2015]/g, '-').replace(/[^\p{L}\p{N}@.+#%-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function groundedValue(source: string, value: string): string {
  const candidate = value.trim();
  if (!candidate) return '';
  const normalizedSource = normalizedEvidence(source);
  const normalizedCandidate = normalizedEvidence(candidate);
  return normalizedCandidate.length > 1 && normalizedSource.includes(normalizedCandidate) ? candidate : '';
}

function groundedList(source: string, values: string[]): string[] {
  return values.map((value) => groundedValue(source, value)).filter(Boolean);
}

export async function parseResumeWithOpenRouter(
  config: OpenRouterConfig,
  text: string,
  baseline: MasterProfile,
): Promise<MasterProfile> {
  const prompt = [
    'Extract the uploaded resume into structured fields.',
    'This is extraction, not rewriting. Copy facts and wording from the source text only.',
    'Never infer a missing name, role, employer, date, location, skill, achievement, metric, qualification, certification, or language.',
    'Keep each distinct position and education item separate. Put accomplishment lines under the correct position.',
    'Preserve source project and credential links. Each certification may include a url field only when the URL is explicitly present beside that credential in the source.',
    'Use empty strings or empty arrays whenever the source does not clearly provide a field.',
    'Return exactly this JSON shape:',
    '{"personal":{"fullName":"","professionalTitle":"","email":"","phone":"","location":"","linkedIn":"","portfolio":"","github":""},"summary":"","skills":[""],"experiences":[{"company":"","jobTitle":"","startDate":"","endDate":"","description":"","bullets":[""],"technologies":[""]}],"projects":[{"name":"","description":"","technologies":[""],"achievements":[""],"url":""}],"education":[{"institution":"","qualification":"","startDate":"","endDate":"","details":""}],"certifications":[{"name":"","issuer":"","date":""}],"languages":[""]}',
    'UPLOADED RESUME TEXT:',
    text,
  ].join('\n\n');
  const parsed = parsedResumeSchema.parse(await callOpenRouter(config, config.agentModel ?? DEFAULT_OPENROUTER_AGENT_MODEL, prompt));

  const personal = {
    fullName: groundedValue(text, parsed.personal.fullName) || baseline.personal.fullName,
    professionalTitle: groundedValue(text, parsed.personal.professionalTitle) || baseline.personal.professionalTitle,
    email: baseline.personal.email || groundedValue(text, parsed.personal.email),
    phone: baseline.personal.phone || groundedValue(text, parsed.personal.phone),
    location: groundedValue(text, parsed.personal.location) || baseline.personal.location,
    linkedIn: baseline.personal.linkedIn || groundedValue(text, parsed.personal.linkedIn),
    portfolio: baseline.personal.portfolio || groundedValue(text, parsed.personal.portfolio),
    github: baseline.personal.github || groundedValue(text, parsed.personal.github),
  };
  const experiences = parsed.experiences.map((item) => ({
    id: createId('exp'),
    company: groundedValue(text, item.company),
    jobTitle: groundedValue(text, item.jobTitle),
    startDate: groundedValue(text, item.startDate),
    endDate: groundedValue(text, item.endDate),
    description: groundedValue(text, item.description),
    bullets: groundedList(text, item.bullets).map((bullet) => ({ id: createId('bullet'), text: bullet })),
    technologies: groundedList(text, item.technologies),
  })).filter((item) => item.company || item.jobTitle || item.description || item.bullets.length);
  const projects = parsed.projects.map((item) => ({
    id: createId('project'),
    name: groundedValue(text, item.name),
    description: groundedValue(text, item.description),
    technologies: groundedList(text, item.technologies),
    achievements: groundedList(text, item.achievements).map((achievement) => ({ id: createId('bullet'), text: achievement })),
    url: groundedValue(text, item.url),
  })).filter((item) => item.name || item.description || item.achievements.length);
  const education = parsed.education.map((item) => ({
    id: createId('edu'),
    institution: groundedValue(text, item.institution),
    qualification: groundedValue(text, item.qualification),
    startDate: groundedValue(text, item.startDate),
    endDate: groundedValue(text, item.endDate),
    details: groundedValue(text, item.details),
  })).filter((item) => item.institution || item.qualification || item.details);
  const certifications = parsed.certifications.map((item) => ({
    id: createId('cert'),
    name: groundedValue(text, item.name),
    issuer: groundedValue(text, item.issuer),
    date: groundedValue(text, item.date),
    url: groundedValue(text, item.url),
  })).filter((item) => item.name);
  const skills = groundedList(text, parsed.skills).map((name) => ({ id: createId('skill'), name, category: baseline.skills.find(skill => skill.name.toLowerCase() === name.toLowerCase())?.category ?? 'General', confirmedByUser: false }));

  return {
    ...baseline,
    personal,
    summary: groundedValue(text, parsed.summary) || baseline.summary,
    skills: skills.length ? skills : baseline.skills,
    experiences: experiences.length ? experiences : baseline.experiences,
    projects: projects.length ? projects : baseline.projects,
    education: education.length ? education : baseline.education,
    certifications: certifications.length ? certifications : baseline.certifications,
    languages: groundedList(text, parsed.languages).length ? groundedList(text, parsed.languages) : baseline.languages,
    sourceText: text.trim(),
    updatedAt: new Date().toISOString(),
  };
}

export async function generateWithOpenRouter(
  config: OpenRouterConfig,
  profile: MasterProfile,
  jobDescription: string,
  jobAnalysis: JobAnalysis,
  matchAnalysis: MatchAnalysis,
): Promise<{ resume: ReturnType<typeof profileToResume>; suggestions: TailoringSuggestion[] }> {
  const agentModel = config.agentModel ?? DEFAULT_OPENROUTER_AGENT_MODEL;
  const writingModel = config.writingModel ?? DEFAULT_OPENROUTER_WRITING_MODEL;
  const evidence = modelProfile(profile);
  const planPrompt = [
    'Act as the resume evidence planner.',
    'Select only existing skill IDs and bullet IDs that are genuinely relevant to the job. Do not write the resume yet.',
    'Return exactly this JSON shape:',
    '{"targetTitle":"string","focusTerms":["supported job terms"],"prioritySkillIds":["existing skill IDs"],"priorityBulletIds":["existing bullet IDs"],"priorityExperienceIds":["existing experience IDs"],"priorityProjectIds":["existing project IDs"],"writingBrief":["short factual instructions"]}',
    'JOB DESCRIPTION:',
    jobDescription,
    'DETERMINISTIC JOB ANALYSIS:',
    JSON.stringify(jobAnalysis),
    'EVIDENCE MATCH:',
    JSON.stringify(matchAnalysis.items),
    'CANDIDATE CV EVIDENCE:',
    JSON.stringify(evidence),
  ].join('\n\n');
  // A failed planner must not prevent the user's selected writing model from running.
  let plan = agentPlanSchema.parse({});
  try {
    plan = agentPlanSchema.parse(await callOpenRouter(config, agentModel, planPrompt));
  } catch { /* The grounded requirement comparison below is the planning baseline. */ }

  const validSkillIds = new Set(profile.skills.map((skill) => skill.id));
  const validBulletIds = new Set(profile.experiences.flatMap((experience) => experience.bullets.map((bullet) => bullet.id)));
  const validExperienceIds = new Set(profile.experiences.map((experience) => experience.id));
  const validProjectIds = new Set(profile.projects.map((project) => project.id));
  const validProjectBulletIds = new Set(profile.projects.flatMap((project) => project.achievements.map((bullet) => bullet.id)));
  const safePlan = {
    ...plan,
    prioritySkillIds: plan.prioritySkillIds.filter((id) => validSkillIds.has(id)),
    priorityBulletIds: plan.priorityBulletIds.filter((id) => validBulletIds.has(id)),
    priorityExperienceIds: plan.priorityExperienceIds.filter((id) => validExperienceIds.has(id)),
    priorityProjectIds: plan.priorityProjectIds.filter((id) => validProjectIds.has(id)),
  };
  const writerPrompt = [
    RESUME_WRITING_STANDARD,
    'Act as the resume writer. Rewrite and organize the CV to emphasize the supplied evidence plan.',
    'Hard rules:',
    '- Keep every employer, role, date, qualification, certification, technology, achievement, and number factual.',
    '- Never add a job requirement unless the same fact exists in the CV evidence.',
    '- Keep the same experience IDs and bullet IDs.',
    '- Keep the same project IDs and achievement bullet IDs.',
    '- Rewrite each bullet only from facts already present in that exact original bullet.',
    '- Reorder only the supplied existing skill IDs.',
    '- The summary may draw on supported facts from the whole BASE_CV, including when the original summary is empty.',
    '- Return concise professional English without commentary.',
    'Return exactly this JSON shape:',
    '{"headline":"truthful positioning headline","summary":"rewritten summary or empty string","skillOrder":["all existing skill IDs"],"skillCategories":[{"category":"short category name","skillIds":["existing skill IDs"]}],"experienceOrder":["all existing experience IDs"],"experiences":[{"experienceId":"existing experience ID","bullets":[{"bulletId":"existing bullet ID","text":"rewritten bullet"}]}],"projectOrder":["all existing project IDs"],"projects":[{"projectId":"existing project ID","achievements":[{"bulletId":"existing achievement bullet ID","text":"rewritten bullet"}]}]}',
    'TARGET PLAN:',
    JSON.stringify(safePlan),
    'JOB DESCRIPTION:',
    jobDescription,
    'CANDIDATE CV EVIDENCE:',
    JSON.stringify(evidence),
  ].join('\n\n');
  const written = writingResultSchema.parse(await callOpenRouter(config, writingModel, writerPrompt));

  const suggestions: TailoringSuggestion[] = [];
  const resume = profileToResume(profile);
  const headlineParts = written.headline.split('|').map((part) => part.trim()).filter((part) => groundedValue(profile.sourceText, part) || profile.skills.some((skill) => normalizedEvidence(skill.name) === normalizedEvidence(part)));
  if (headlineParts.length) resume.personal.professionalTitle = headlineParts.join(' | ');
  if (profile.summary.trim() && written.summary.trim() && written.summary.trim() !== profile.summary.trim() && safeRewrite(profile.summary, written.summary, profile, matchAnalysis)) {
    suggestions.push(validateSuggestion(profile, {
      id: createId('suggestion'),
      section: 'summary',
      original: profile.summary,
      suggested: written.summary.trim(),
      reason: 'Reframes the existing summary around the role while preserving the candidate evidence.',
      sourceReference: { type: 'summary', entityId: profile.id, field: 'summary', excerpt: profile.summary },
      status: 'pending',
      validationStatus: 'verified',
    }));
  }

  const orderedSkillIds = [...new Set(written.skillOrder.filter((id) => validSkillIds.has(id)))];
  for (const skill of profile.skills) if (!orderedSkillIds.includes(skill.id)) orderedSkillIds.push(skill.id);
  const orderedSkills = orderedSkillIds.map((id) => profile.skills.find((skill) => skill.id === id)).filter((skill): skill is MasterProfile['skills'][number] => Boolean(skill));
  const categoryBySkillId = new Map<string, string>();
  for (const group of written.skillCategories) {
    const category = group.category.trim().slice(0, 40);
    if (!category) continue;
    for (const id of group.skillIds) if (validSkillIds.has(id) && !categoryBySkillId.has(id)) categoryBySkillId.set(id, category);
  }
  resume.skills = orderedSkills.map((skill) => ({ ...skill, category: categoryBySkillId.get(skill.id) ?? skill.category }));
  const originalSkillNames = profile.skills.map((skill) => skill.name);
  const orderedSkillNames = orderedSkills.map((skill) => skill.name);
  if (orderedSkillNames.join('\u0000') !== originalSkillNames.join('\u0000') && profile.skills[0]) {
    suggestions.push(validateSuggestion(profile, {
      id: createId('suggestion'),
      section: 'skills',
      original: originalSkillNames.join(' · '),
      suggested: orderedSkillNames.join(' · '),
      reason: 'Places existing role-relevant skills first without adding new skills.',
      sourceReference: { type: 'skill', entityId: profile.skills[0].id, field: 'skills', excerpt: profile.skills[0].name },
      status: 'pending',
      validationStatus: 'verified',
    }));
  }

  for (const writtenExperience of written.experiences) {
    const experience = profile.experiences.find((item) => item.id === writtenExperience.experienceId);
    if (!experience) continue;
    for (const writtenBullet of writtenExperience.bullets) {
      const bullet = experience.bullets.find((item) => item.id === writtenBullet.bulletId);
      const suggested = writtenBullet.text.trim();
      if (!bullet || !suggested || suggested === bullet.text || !safeRewrite(bullet.text, suggested, profile, matchAnalysis)) continue;
      suggestions.push(validateSuggestion(profile, {
        id: createId('suggestion'),
        section: 'experience',
        original: bullet.text,
        suggested,
        reason: 'Makes the documented experience clearer and more relevant to the role.',
        sourceReference: { type: 'experience', entityId: experience.id, field: 'bullet:' + bullet.id, excerpt: bullet.text },
        status: 'pending',
        validationStatus: 'verified',
      }));
    }
  }

  const experienceOrder = [...new Set(written.experienceOrder.filter((id) => validExperienceIds.has(id)))];
  for (const item of resume.experiences) if (!experienceOrder.includes(item.id)) experienceOrder.push(item.id);
  resume.experiences.sort((a, b) => experienceOrder.indexOf(a.id) - experienceOrder.indexOf(b.id));

  const projectOrder = [...new Set(written.projectOrder.filter((id) => validProjectIds.has(id)))];
  for (const item of resume.projects) if (!projectOrder.includes(item.id)) projectOrder.push(item.id);
  resume.projects.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
  for (const writtenProject of written.projects) {
    const project = profile.projects.find((item) => item.id === writtenProject.projectId);
    if (!project) continue;
    for (const writtenAchievement of writtenProject.achievements) {
      if (!validProjectBulletIds.has(writtenAchievement.bulletId)) continue;
      const achievement = project.achievements.find((item) => item.id === writtenAchievement.bulletId);
      const suggested = writtenAchievement.text.trim();
      if (!achievement || !suggested || suggested === achievement.text || !safeRewrite(achievement.text, suggested, profile, matchAnalysis)) continue;
      suggestions.push(validateSuggestion(profile, {
        id: createId('suggestion'),
        section: 'projects',
        original: achievement.text,
        suggested,
        reason: 'Makes the documented project work clearer and more relevant to the target role.',
        sourceReference: { type: 'project', entityId: project.id, field: 'achievement:' + achievement.id, excerpt: achievement.text },
        status: 'pending',
        validationStatus: 'verified',
      }));
    }
  }

  if (!suggestions.length) throw new Error('OpenRouter did not return any safe CV improvements.');
  return { resume, suggestions };
}
