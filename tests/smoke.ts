import assert from 'node:assert/strict';
import { profileToResume } from '../lib/domain/schema.ts';
import { resumeBlocks, safeLink, validateExport } from '../lib/export/resume-document.ts';
import { analyzeJobDescription } from '../lib/domain/job-analysis.ts';
import { compareResumeToJob } from '../lib/domain/matching.ts';
import { parseResumeText } from '../lib/domain/resume-parser.ts';
import { applyVerifiedSuggestions, buildTailoringPlan, validateSuggestion } from '../lib/domain/tailoring.ts';
import { DEFAULT_OPENROUTER_AGENT_MODEL, DEFAULT_OPENROUTER_WRITING_MODEL, hasOnlySupportedNumbers } from '../lib/ai/openrouter.ts';

const source = `Jordan Lee\nData Analyst\njordan@example.com\n\nProfessional Summary\nData analyst experienced in Python, SQL, and Power BI.\n\nSkills\nPython, SQL, Power BI, Excel, Azure\n\nExperience\n- Responsible for creating Power BI dashboards for stakeholders\n- Worked on SQL reporting pipelines\n\nEducation\nBSc Computer Science`;
const profile = parseResumeText(source);
const templateFixture = profileToResume(profile);
templateFixture.experiences = [{ id: 'template-exp', company: 'Example employer', jobTitle: 'Actual intern title', startDate: '2025', endDate: '2026', description: '', technologies: [], bullets: [{id: 'template-bullet', text: 'Built a reporting dashboard.'}] }];
templateFixture.education = [{id:'template-edu',institution:'Example University',qualification:'BSc Computer Science',startDate:'',endDate:'2026',details:'GPA: 4.66/5.00'}];
templateFixture.certifications = [{id:'template-cert',name:'Source credential',issuer:'Source issuer',date:'',url:'https://example.com/credential'}];
const beforeTemplate = JSON.stringify(templateFixture);
const blocks = resumeBlocks(templateFixture);
assert.equal(JSON.stringify(templateFixture), beforeTemplate, 'Rendering must not mutate candidate facts.');
assert.equal(blocks.find(b => b.role === 'entry')?.runs[0].text, 'Example employer');
assert.equal(blocks.find(b => b.role === 'subline')?.runs[0].text, 'Actual intern title');
assert.ok(blocks.some(b => b.role === 'detail' && b.runs[0].text === 'GPA: 4.66/5.00'));
assert.ok(blocks.some(b => b.role === 'certification' && b.runs[0].href === 'https://example.com/credential'));
assert.equal(safeLink('javascript:alert(1)'), undefined);
assert.equal(safeLink('https://example.com/?a=1&b=2'), 'https://example.com/?a=1&b=2');
assert.throws(() => validateExport({...templateFixture, personal:{...templateFixture.personal,fullName:''}}));
assert.ok(!resumeBlocks({...templateFixture,hiddenSections:['experience']}).some(b => b.runs.some(r => r.text === 'Example employer')));
assert.equal(profile.personal.fullName, 'Jordan Lee');
assert.ok(profile.skills.some((item) => item.name === 'Python'));
assert.ok(!profile.skills.some((item) => item.name === 'Kubernetes'));

const analysis = analyzeJobDescription('Required: Python and SQL. Azure is preferred. Docker is nice to have.', 'Data Analyst');
assert.equal(analysis.requirements.find((item) => item.label === 'Python')?.importance, 'critical');
assert.equal(analysis.requirements.find((item) => item.label === 'Azure')?.importance, 'nice-to-have');
assert.equal(analysis.requirements.find((item) => item.label === 'Docker')?.importance, 'nice-to-have');

const matchingJob = analyzeJobDescription('Required: Python, SQL, Kubernetes, and data pipelines.', 'Data Analyst');
const match = compareResumeToJob(profile, matchingJob);
assert.equal(match.items.find((item) => item.label === 'Python')?.status, 'strong');
assert.equal(match.items.find((item) => item.label === 'Data pipelines')?.status, 'partial');
assert.equal(match.items.find((item) => item.label === 'Kubernetes')?.status, 'missing');

const before = JSON.stringify(profile);
const plan = buildTailoringPlan(profile, matchingJob, match);
assert.equal(JSON.stringify(profile), before);
assert.ok(!plan.resume.skills.some((item) => item.name === 'Kubernetes'));
const unsafe = validateSuggestion(profile, {
  id: 'smoke', section: 'experience', original: 'Worked on SQL reporting pipelines', suggested: 'Improved SQL reporting by 35%', reason: 'test',
  sourceReference: { type: 'experience', entityId: profile.experiences[0].id, field: 'bullet:test', excerpt: 'Worked on SQL reporting pipelines' }, status: 'pending', validationStatus: 'verified',
});
assert.equal(unsafe.validationStatus, 'review');
const generated = applyVerifiedSuggestions(plan.resume, [...plan.suggestions, unsafe]);
assert.ok(generated.appliedCount > 0);
assert.ok(generated.suggestions.filter((item) => item.validationStatus === 'verified').every((item) => item.status === 'accepted'));
assert.equal(generated.suggestions.find((item) => item.id === unsafe.id)?.status, 'pending');
assert.ok(!JSON.stringify(generated.resume).includes('35%'));
assert.equal(DEFAULT_OPENROUTER_AGENT_MODEL, 'minimax/minimax-m3:free');
assert.equal(DEFAULT_OPENROUTER_WRITING_MODEL, 'z-ai/glm-5.2:free');
assert.equal(hasOnlySupportedNumbers('Improved conversion by 18%', 'Raised conversion by 18%'), true);
assert.equal(hasOnlySupportedNumbers('Improved conversion', 'Raised conversion by 18%'), false);
console.log('TailorCV smoke tests passed: parsing, matching, OpenRouter configuration, safe auto-editing, and hallucination checks.');
