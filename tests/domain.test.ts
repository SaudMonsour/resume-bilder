import { describe, expect, it } from 'vitest';
import { analyzeJobDescription } from '../lib/domain/job-analysis';
import { compareResumeToJob } from '../lib/domain/matching';
import { parseResumeText } from '../lib/domain/resume-parser';
import { profileToResume } from '../lib/domain/schema';
import { buildTailoringPlan, validateSuggestion } from '../lib/domain/tailoring';

const source = `Jordan Lee
Data Analyst
jordan@example.com

Professional Summary
Data analyst experienced in Python, SQL, and Power BI.

Skills
Python, SQL, Power BI, Excel, Azure

Experience
- Responsible for creating Power BI dashboards for stakeholders
- Worked on SQL reporting pipelines

Education
BSc Computer Science`;

describe('resume tailoring domain', () => {
  it('extracts a structured profile without inventing a skill', () => {
    const profile = parseResumeText(source);
    expect(profile.personal.fullName).toBe('Jordan Lee');
    expect(profile.skills.map((item) => item.name)).toContain('Python');
    expect(profile.skills.map((item) => item.name)).not.toContain('Kubernetes');
    expect(profile.sourceText).toBe(source);
  });

  it('extracts importance from sentence-level job requirements', () => {
    const analysis = analyzeJobDescription('Required: Python and SQL. Azure is preferred. Docker is nice to have.', 'Data Analyst');
    expect(analysis.requirements.find((item) => item.label === 'Python')?.importance).toBe('critical');
    expect(analysis.requirements.find((item) => item.label === 'Azure')?.importance).toBe('nice-to-have');
    expect(analysis.requirements.find((item) => item.label === 'Docker')?.importance).toBe('nice-to-have');
  });

  it('marks unsupported requirements missing and related evidence partial', () => {
    const profile = parseResumeText(source);
    const analysis = analyzeJobDescription('Required: Python, SQL, Kubernetes, and data pipelines.', 'Data Analyst');
    const match = compareResumeToJob(profile, analysis);
    expect(match.items.find((item) => item.label === 'Python')?.status).toBe('strong');
    expect(match.items.find((item) => item.label === 'Data pipelines')?.status).toBe('partial');
    expect(match.items.find((item) => item.label === 'Kubernetes')?.status).toBe('missing');
  });

  it('preserves the master profile while creating a separate tailored resume', () => {
    const profile = parseResumeText(source);
    const before = JSON.stringify(profile);
    const analysis = analyzeJobDescription('Required: Python and SQL.', 'Data Analyst');
    const match = compareResumeToJob(profile, analysis);
    const plan = buildTailoringPlan(profile, analysis, match);
    expect(JSON.stringify(profile)).toBe(before);
    expect(plan.resume).not.toBe(profile);
    expect(plan.resume.skills.map((item) => item.name)).not.toContain('Kubernetes');
  });

  it('flags generated metrics that are not present in the source evidence', () => {
    const profile = parseResumeText(source);
    const resume = profileToResume(profile);
    const suggestion = validateSuggestion(profile, {
      id: 'test', section: 'experience', original: 'Worked on SQL reporting pipelines', suggested: 'Improved SQL reporting by 35%', reason: 'test',
      sourceReference: { type: 'experience', entityId: profile.experiences[0].id, field: 'bullet:test', excerpt: 'Worked on SQL reporting pipelines' }, status: 'pending', validationStatus: 'verified',
    });
    expect(suggestion.validationStatus).toBe('review');
    expect(resume.experiences[0].bullets[1].text).toContain('SQL');
  });
});
