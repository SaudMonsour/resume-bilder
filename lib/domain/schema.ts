import { z } from 'zod';

export const sourceReferenceSchema = z.object({
  type: z.enum(['summary', 'experience', 'project', 'skill', 'education', 'certification']),
  entityId: z.string().min(1),
  field: z.string().min(1),
  excerpt: z.string().min(1),
});

export const personalInfoSchema = z.object({
  fullName: z.string().default(''),
  professionalTitle: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  linkedIn: z.string().default(''),
  portfolio: z.string().default(''),
  github: z.string().default(''),
});

export const skillSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string().default('General'),
  confirmedByUser: z.boolean().default(false),
});

export const bulletSchema = z.object({ id: z.string(), text: z.string() });

export const experienceSchema = z.object({
  id: z.string(),
  company: z.string().default(''),
  jobTitle: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  description: z.string().default(''),
  bullets: z.array(bulletSchema).default([]),
  technologies: z.array(z.string()).default([]),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  description: z.string().default(''),
  technologies: z.array(z.string()).default([]),
  achievements: z.array(bulletSchema).default([]),
  url: z.string().default(''),
});

export const educationSchema = z.object({
  id: z.string(),
  institution: z.string().default(''),
  qualification: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  details: z.string().default(''),
});

export const certificationSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  issuer: z.string().default(''),
  date: z.string().default(''),
  url: z.string().optional(),
});

export const masterProfileSchema = z.object({
  id: z.string().default('master'),
  personal: personalInfoSchema.default(personalInfoSchema.parse({})),
  summary: z.string().default(''),
  skills: z.array(skillSchema).default([]),
  experiences: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  languages: z.array(z.string()).default([]),
  other: z.array(z.string()).default([]),
  sourceText: z.string().default(''),
  updatedAt: z.string().default(''),
});

export const requirementSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum([
    'technical',
    'experience',
    'education',
    'certification',
    'responsibility',
    'soft-skill',
    'domain',
  ]),
  importance: z.enum(['critical', 'important', 'nice-to-have']),
  evidenceText: z.string(),
});

export const jobAnalysisSchema = z.object({
  jobTitle: z.string().default(''),
  seniority: z.string().default('Not specified'),
  roleCategory: z.string().default('General'),
  requirements: z.array(requirementSchema),
  atsKeywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  educationRequirements: z.array(z.string()),
  certificationRequirements: z.array(z.string()),
  yearsOfExperience: z.array(z.string()),
  softSkills: z.array(z.string()),
  domainKeywords: z.array(z.string()),
});

export const matchItemSchema = z.object({
  requirementId: z.string(),
  label: z.string(),
  category: requirementSchema.shape.category,
  importance: requirementSchema.shape.importance,
  status: z.enum(['strong', 'partial', 'missing']),
  explanation: z.string(),
  sourceReferences: z.array(sourceReferenceSchema),
});

export const matchAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  scoreLabel: z.literal('Internal relevance estimate'),
  breakdown: z.object({
    technicalSkills: z.number(),
    experience: z.number(),
    education: z.number(),
    certifications: z.number(),
    responsibilities: z.number(),
    atsKeywords: z.number(),
  }),
  items: z.array(matchItemSchema),
});

export const tailoringSuggestionSchema = z.object({
  id: z.string(),
  section: z.enum(['summary', 'skills', 'experience', 'projects']),
  original: z.string(),
  suggested: z.string(),
  reason: z.string(),
  sourceReference: sourceReferenceSchema,
  status: z.enum(['pending', 'accepted', 'rejected', 'edited']).default('pending'),
  validationStatus: z.enum(['verified', 'review']).default('verified'),
});

export const resumeVersionSchema = z.object({
  personal: personalInfoSchema,
  summary: z.string(),
  skills: z.array(skillSchema),
  experiences: z.array(experienceSchema),
  projects: z.array(projectSchema),
  education: z.array(educationSchema),
  certifications: z.array(certificationSchema),
  languages: z.array(z.string()),
  sectionOrder: z.array(z.string()),
  hiddenSections: z.array(z.string()),
  template: z.enum(['classic', 'modern', 'technical']),
  paperSize: z.enum(['A4', 'Letter']),
});

export const applicationSchema = z.object({
  id: z.string(),
  company: z.string(),
  jobTitle: z.string(),
  jobUrl: z.string().default(''),
  jobDescription: z.string(),
  notes: z.string().default(''),
  status: z.enum(['Preparing', 'Applied', 'Interview', 'Rejected', 'Offer', 'Archived']),
  createdAt: z.string(),
  matchAnalysis: matchAnalysisSchema,
  jobAnalysis: jobAnalysisSchema,
  tailoredResume: resumeVersionSchema,
  suggestions: z.array(tailoringSuggestionSchema),
  coverLetter: z.string().default(''),
});

export type MasterProfile = z.infer<typeof masterProfileSchema>;
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
export type MatchAnalysis = z.infer<typeof matchAnalysisSchema>;
export type MatchItem = z.infer<typeof matchItemSchema>;
export type TailoringSuggestion = z.infer<typeof tailoringSuggestionSchema>;
export type ResumeVersion = z.infer<typeof resumeVersionSchema>;
export type JobApplication = z.infer<typeof applicationSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const emptyProfile: MasterProfile = masterProfileSchema.parse({
  id: 'master',
  updatedAt: new Date(0).toISOString(),
});

export function profileToResume(profile: MasterProfile): ResumeVersion {
  return resumeVersionSchema.parse({
    personal: profile.personal,
    summary: profile.summary,
    skills: profile.skills,
    experiences: profile.experiences,
    projects: profile.projects,
    education: profile.education,
    certifications: profile.certifications,
    languages: profile.languages,
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
    hiddenSections: [],
    template: 'classic',
    paperSize: 'A4',
  });
}
