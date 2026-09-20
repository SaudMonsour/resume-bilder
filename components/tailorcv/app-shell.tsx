/* oxlint-disable jsx-a11y/label-has-associated-control */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSearch,
  FileText,
  LoaderCircle,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createId } from '@/lib/domain/ids';
import {
  emptyProfile,
  type JobAnalysis,
  type MasterProfile,
  type MatchAnalysis,
  type ResumeVersion,
  type TailoringSuggestion,
} from '@/lib/domain/schema';
import { applyVerifiedSuggestions } from '@/lib/domain/tailoring';
import { parseSkills } from '@/lib/domain/resume-parser';
import { ResumePreview } from './resume-preview';

type LoadingState = 'upload' | 'confirm' | 'update' | 'export-pdf' | 'export-docx' | null;
type UploadedResumeFile = { id: string; name: string; mimeType: string; localUrl?: string };
type AnalysisResult = {
  jobAnalysis: JobAnalysis;
  matchAnalysis: MatchAnalysis;
  resume: ResumeVersion;
  suggestions: TailoringSuggestion[];
  provider?: string;
  writingModel?: string | null;
  warning?: string;
};

function profileQuality(profile: MasterProfile | ResumeVersion) {
  const bulletCount = profile.experiences.reduce((sum, item) => sum + item.bullets.filter((bullet) => bullet.text.trim()).length, 0);
  const sectionCount = Number(profile.summary.trim().length > 20)
    + Number(profile.skills.length > 0)
    + Number(profile.experiences.length > 0 && bulletCount > 0)
    + Number(profile.projects.length > 0)
    + Number(profile.education.length > 0)
    + Number(profile.certifications.length > 0);
  const problems: string[] = [];
  if (!profile.personal.fullName.trim()) problems.push('Add your full name.');
  if (profile.experiences.some(item => item.bullets.length && (!item.company.trim() || !item.jobTitle.trim()))) problems.push('A role is missing its employer or job title. Replace the upload to read it again, or correct those fields.');
  if (sectionCount === 0) problems.push('Add at least one real CV section such as experience, education, skills, or a summary.');
  return { usable: problems.length === 0, problems, bulletCount, sectionCount };
}

async function saveProfile(profile: MasterProfile) {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error('I could not save your corrected CV. Please try again.');
}

async function importResumeFile(file: File): Promise<{ profile: MasterProfile; file: UploadedResumeFile; parseMode: string }> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Your CV must be 8 MB or smaller.');
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error('Please choose a PDF, DOCX, or TXT file.');
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api/parse-resume', { method: 'POST', body: form });
  const data = await response.json() as { error?: string; profile?: MasterProfile; file?: UploadedResumeFile; parseMode?: string };
  if (!response.ok || !data.profile || !data.file) throw new Error(data.error ?? 'I could not read this CV.');
  await saveProfile(data.profile);
  return { profile: data.profile, file: data.file, parseMode: data.parseMode ?? 'basic' };
}

export function TailorCVApp() {
  const [profile, setProfile] = useState<MasterProfile>(structuredClone(emptyProfile));
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [sourceFile, setSourceFile] = useState<UploadedResumeFile | null>(null);
  const [showUploader, setShowUploader] = useState(true);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [parseMode, setParseMode] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [resume, setResume] = useState<ResumeVersion | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [writerUsed, setWriterUsed] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState<LoadingState>(null);
  const [uploadError, setUploadError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [notice, setNotice] = useState('');
  const hasUploadedProfile = Boolean(profile.sourceText || profile.personal.fullName || profile.experiences.length || profile.skills.length || profile.education.length);
  const quality = useMemo(() => profileQuality(profile), [profile]);
  const sourcePreviewUrl = sourceFile?.localUrl ?? '';

  useEffect(() => {
    fetch('/api/profile')
      .then(async (response): Promise<{ profile?: MasterProfile; file?: UploadedResumeFile } | null> => response.ok ? await response.json() as { profile?: MasterProfile; file?: UploadedResumeFile } : null)
      .then((data) => {
        if (data?.profile) {
          setProfile(data.profile);
          setSourceFile(data.file ?? null);
          setShowUploader(false);
        }
      })
      .catch(() => undefined)
      .finally(() => setProfileLoaded(true));
  }, []);

  useEffect(() => {
    if (!sourceFile?.id || sourceFile.localUrl) return;
    const controller = new AbortController();
    const fileId = sourceFile.id;
    void fetch(`/api/files/${encodeURIComponent(fileId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Saved CV unavailable');
        const localUrl = URL.createObjectURL(await response.blob());
        setSourceFile((current) => {
          if (!current || current.id !== fileId || current.localUrl) {
            URL.revokeObjectURL(localUrl);
            return current;
          }
          return { ...current, localUrl };
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [sourceFile?.id, sourceFile?.localUrl]);

  useEffect(() => () => {
    if (sourceFile?.localUrl) URL.revokeObjectURL(sourceFile.localUrl);
  }, [sourceFile?.localUrl]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'start_resume_tailoring',
      title: 'Update CV for a job',
      description: 'Open TailorCV to verify an uploaded CV and tailor it to company requirements.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async () => {
        setResume(null);
        window.setTimeout(() => document.getElementById(hasUploadedProfile ? 'cv-review' : 'resume-upload')?.scrollIntoView({ behavior: 'smooth' }), 0);
        return { ready: true, needsResume: !hasUploadedProfile, needsConfirmation: hasUploadedProfile && !profileConfirmed };
      },
    }, { signal: controller.signal })).catch(() => undefined);
    return () => controller.abort();
  }, [hasUploadedProfile, profileConfirmed]);

  const showMessage = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  const upload = async (file: File) => {
    setLoading('upload'); setUploadError(''); setProfileConfirmed(false);
    try {
      const imported = await importResumeFile(file);
      setProfile(imported.profile);
      setSourceFile({ ...imported.file, localUrl: URL.createObjectURL(file) });
      setParseMode(imported.parseMode);
      setShowUploader(false);
      setResume(null);
      showMessage('CV uploaded — review what we captured');
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'I could not read this CV.');
    } finally {
      setLoading(null);
    }
  };

  const changeProfile = (next: MasterProfile) => {
    setProfile(next);
    setProfileConfirmed(false);
    setUploadError('');
  };

  const confirmProfile = async () => {
    if (!quality.usable) { setUploadError(quality.problems.join(' ')); return; }
    setLoading('confirm'); setUploadError('');
    try {
      await saveProfile(profile);
      setProfileConfirmed(true);
      showMessage('CV confirmed');
      window.setTimeout(() => document.getElementById('company-requirements')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'I could not save the CV.');
    } finally {
      setLoading(null);
    }
  };

  const updateCv = async () => {
    if (!profileConfirmed) { setUploadError('Review and confirm your uploaded CV first.'); return; }
    if (requirements.trim().length < 20) { setUpdateError('Paste the company’s job requirements first.'); return; }
    setLoading('update'); setUpdateError('');
    try {
      const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, jobDescription: requirements, jobTitle }),
        });
      if (!response.ok) throw new Error('The tailoring request failed. Your original CV is unchanged. Please try again.');
      const data = await response.json() as AnalysisResult;
      const generated = applyVerifiedSuggestions(data.resume, data.suggestions);
      if (!profileQuality(generated.resume).usable) throw new Error('The updated CV is incomplete. Go back and correct the uploaded CV before downloading.');
      setResume(generated.resume);
      setAnalysisResult(data);
      if (!jobTitle) setJobTitle(data.jobAnalysis.jobTitle);
      setChangeCount(generated.appliedCount);
      setWriterUsed(data.writingModel ?? 'Not configured');
      showMessage(data.provider === 'openrouter' ? 'Your tailored CV is ready to review' : 'AI rewrite unavailable — source draft preserved');
      window.setTimeout(() => document.getElementById('cv-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : 'I could not update the CV. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const exportDocx = async () => {
    if (!resume) return;
    const result = profileQuality(resume);
    if (!result.usable) { setUpdateError('This CV is incomplete and cannot be downloaded yet. Add your name and career information first.'); return; }
    setLoading('export-docx'); setUpdateError('');
    try {
      const response = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resume),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'The DOCX download failed. Please try again.');
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${resume.personal.fullName || 'Updated-CV'}.docx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : 'The download failed.');
    } finally {
      setLoading(null);
    }
  };

  const exportPdf = async () => {
    if (!resume) return;
    const result = profileQuality(resume);
    if (!result.usable) { setUpdateError('This CV is incomplete and cannot be downloaded yet. Add your name and career information first.'); return; }
    setLoading('export-pdf'); setUpdateError('');
    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resume),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'The PDF download failed. Please try again.');
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${resume.personal.fullName || 'Updated-CV'}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : 'The PDF download failed.');
    } finally {
      setLoading(null);
    }
  };

  if (resume) {
    return <EditorScreen
      resume={resume}
      sourceFile={sourceFile}
      sourcePreviewUrl={sourcePreviewUrl}
      sourceText={profile.sourceText}
      company={company}
      jobTitle={jobTitle}
      changeCount={changeCount}
      writerUsed={writerUsed}
      analysis={analysisResult}
      loading={loading}
      error={updateError}
      setResume={setResume}
      onBack={() => setResume(null)}
      onReset={() => { setResume(null); setCompany(''); setJobTitle(''); setRequirements(''); setUpdateError(''); }}
      onExportPdf={exportPdf}
      onExportDocx={exportDocx}
    />;
  }

  return <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
    {notice && <output className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full bg-[#1d1d1f]/95 px-4 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-xl">{notice}</output>}
    <SimpleHeader />
    <section className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[13px] font-semibold text-[#0071e3]">Your CV, checked before it changes.</p>
        <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.05em] sm:text-[54px]">Tailor your real CV to the job.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-7 text-black/48">First verify exactly what we read from your document. Then paste the job requirements and get a complete, editable CV.</p>
      </div>

      {!profileLoaded ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-6 animate-spin text-black/30" /></div> : (showUploader || !hasUploadedProfile) ? (
        <Card id="resume-upload" className="apple-card mx-auto mt-10 max-w-3xl"><CardContent className="p-6 sm:p-8">
          <StepHeading number="1" title="Upload your current CV" subtitle="We’ll read it, then show you exactly what was captured." />
          <div className="mt-6"><ResumeDropzone loading={loading === 'upload'} error={uploadError} onFile={upload} /></div>
          {hasUploadedProfile && <button className="mt-4 w-full text-center text-sm font-medium text-[#0071e3] hover:underline" onClick={() => setShowUploader(false)}>Cancel and keep the current CV</button>}
        </CardContent></Card>
      ) : (
        <CVReview
          profile={profile}
          file={sourceFile}
          sourcePreviewUrl={sourcePreviewUrl}
          confirmed={profileConfirmed}
          parseMode={parseMode}
          loading={loading}
          error={uploadError}
          onChange={changeProfile}
          onConfirm={confirmProfile}
          onReplace={() => { setShowUploader(true); setProfileConfirmed(false); }}
        />
      )}

      {hasUploadedProfile && !showUploader && <section id="company-requirements" className="mt-7 scroll-mt-24">
        <Card className={`apple-card transition ${profileConfirmed ? '' : 'opacity-60'}`}><CardContent className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4"><StepHeading number="2" title="Paste the company requirements" subtitle="TailorCV will use only evidence you confirmed above." />{!profileConfirmed && <span className="rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-medium text-black/45">Confirm step 1 first</span>}</div>
          <fieldset disabled={!profileConfirmed || loading !== null} className="mt-6 disabled:cursor-not-allowed">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Company (optional)" value={company} onChange={setCompany} placeholder="Company name" /><Field label="Job title (optional)" value={jobTitle} onChange={setJobTitle} placeholder="Role title" /></div>
            <label className="mt-4 block text-xs font-medium text-black/50">Job description or requirements<Textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Paste everything the company requested here…" className="mt-2 min-h-56 rounded-[16px] border-black/10 bg-[#fafafa] p-4 text-sm leading-6" /></label>
          </fieldset>
          {updateError && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600"><CircleAlert className="size-4 shrink-0" />{updateError}</p>}
          <div className="mt-6 flex flex-col items-center">
            <Button onClick={updateCv} disabled={loading !== null || !profileConfirmed} className="h-14 w-full rounded-full bg-[#0071e3] px-8 text-base font-semibold shadow-[0_12px_32px_rgb(0_113_227/24%)] hover:bg-[#0077ed] sm:w-auto sm:min-w-72">{loading === 'update' ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {loading === 'update' ? 'Tailoring your CV…' : 'Create my tailored CV'}</Button>
            <p className="mt-4 text-center text-xs leading-5 text-black/38"><ShieldCheck className="mr-1 inline size-3.5 text-[#34c759]" />No invented experience, qualifications, or numbers.</p>
          </div>
        </CardContent></Card>
      </section>}
    </section>
  </main>;
}

function CVReview({ profile, file, sourcePreviewUrl, confirmed, parseMode, loading, error, onChange, onConfirm, onReplace }: { profile: MasterProfile; file: UploadedResumeFile | null; sourcePreviewUrl: string; confirmed: boolean; parseMode: string; loading: LoadingState; error: string; onChange: (profile: MasterProfile) => void; onConfirm: () => void; onReplace: () => void }) {
  const quality = profileQuality(profile);
  const updatePersonal = (key: keyof MasterProfile['personal'], value: string) => onChange({ ...profile, personal: { ...profile.personal, [key]: value } });
  const updateExperience = (id: string, key: 'company' | 'jobTitle' | 'startDate' | 'endDate', value: string) => onChange({ ...profile, experiences: profile.experiences.map((item) => item.id === id ? { ...item, [key]: value } : item) });
  const updateBullet = (experienceId: string, bulletId: string, text: string) => onChange({ ...profile, experiences: profile.experiences.map((item) => item.id === experienceId ? { ...item, bullets: item.bullets.map((bullet) => bullet.id === bulletId ? { ...bullet, text } : bullet) } : item) });
  const addExperience = () => onChange({ ...profile, experiences: [...profile.experiences, { id: createId('exp'), company: '', jobTitle: '', startDate: '', endDate: '', description: '', bullets: [{ id: createId('bullet'), text: '' }], technologies: [] }] });
  const updateEducation = (id: string, key: 'institution' | 'qualification' | 'startDate' | 'endDate', value: string) => onChange({ ...profile, education: profile.education.map((item) => item.id === id ? { ...item, [key]: value } : item) });

  return <section id="cv-review" className="mt-10 scroll-mt-24">
    <Card className="apple-card overflow-hidden"><CardContent className="p-0">
      <div className="flex flex-col justify-between gap-4 border-b border-black/[0.06] px-6 py-6 sm:flex-row sm:items-center sm:px-8">
        <StepHeading number="1" title="Check your uploaded CV" subtitle="Original document on the left. Editable information TailorCV will use on the right." />
        <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${confirmed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{confirmed ? 'Confirmed' : 'Needs your check'}</span><Button variant="outline" onClick={onReplace} className="rounded-full border-black/10 bg-white"><Upload /> Replace</Button></div>
      </div>
      <div className="grid xl:grid-cols-2">
        <div className="border-b border-black/[0.06] bg-[#f0f0f2] p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Original upload</p><p className="mt-0.5 max-w-72 truncate text-xs text-black/42">{file?.name ?? 'Extracted source text'}</p></div>{sourcePreviewUrl && <a href={sourcePreviewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-[#0071e3] hover:underline">Open original <ExternalLink className="size-3.5" /></a>}</div>
          <OriginalCV file={file} url={sourcePreviewUrl} sourceText={profile.sourceText} />
        </div>
        <div className="max-h-[840px] overflow-auto bg-white p-5 sm:p-7">
          <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Information TailorCV captured</p><p className="mt-1 text-xs text-black/42">Edit anything that is missing or incorrect.</p></div><span className="flex items-center gap-1.5 text-xs font-medium text-[#0071e3]"><PencilLine className="size-3.5" /> Editable</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Full name" value={profile.personal.fullName} onChange={(value) => updatePersonal('fullName', value)} placeholder="Required" /><Field label="Professional title" value={profile.personal.professionalTitle} onChange={(value) => updatePersonal('professionalTitle', value)} /><Field label="Email" value={profile.personal.email} onChange={(value) => updatePersonal('email', value)} /><Field label="Phone" value={profile.personal.phone} onChange={(value) => updatePersonal('phone', value)} /><Field label="Location" value={profile.personal.location} onChange={(value) => updatePersonal('location', value)} /><Field label="LinkedIn" value={profile.personal.linkedIn} onChange={(value) => updatePersonal('linkedIn', value)} /><Field label="Portfolio" value={profile.personal.portfolio} onChange={(value) => updatePersonal('portfolio', value)} /><Field label="GitHub" value={profile.personal.github} onChange={(value) => updatePersonal('github', value)} /></div>
          <label className="mt-5 block text-xs font-medium text-black/50">Professional summary<Textarea value={profile.summary} onChange={(event) => onChange({ ...profile, summary: event.target.value })} placeholder="Your existing professional summary" className="mt-2 min-h-28 rounded-[14px] border-black/10 text-sm leading-6" /></label>
          <SkillsEditor key={JSON.stringify(profile.skills)} skills={profile.skills} onChange={(skills) => onChange({ ...profile, skills })} />

          <div className="mt-7 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-black/40"><BriefcaseBusiness className="size-4" /> Experience</p><button onClick={addExperience} className="flex items-center gap-1 text-xs font-semibold text-[#0071e3]"><Plus className="size-3.5" /> Add role</button></div>
          <div className="mt-3 space-y-4">{profile.experiences.map((experience, index) => <div key={experience.id} className="rounded-[16px] border border-black/[0.07] bg-[#fafafa] p-4"><p className="mb-3 text-xs font-semibold text-black/42">Role {index + 1}</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Job title" value={experience.jobTitle} onChange={(value) => updateExperience(experience.id, 'jobTitle', value)} /><Field label="Company" value={experience.company} onChange={(value) => updateExperience(experience.id, 'company', value)} /><Field label="Start date" value={experience.startDate} onChange={(value) => updateExperience(experience.id, 'startDate', value)} /><Field label="End date" value={experience.endDate} onChange={(value) => updateExperience(experience.id, 'endDate', value)} /></div><div className="mt-3 space-y-2">{experience.bullets.map((bullet) => <Textarea key={bullet.id} value={bullet.text} onChange={(event) => updateBullet(experience.id, bullet.id, event.target.value)} placeholder="Responsibility or achievement from your CV" className="min-h-16 rounded-[12px] border-black/10 bg-white text-xs leading-5" />)}</div><button onClick={() => onChange({ ...profile, experiences: profile.experiences.map((item) => item.id === experience.id ? { ...item, bullets: [...item.bullets, { id: createId('bullet'), text: '' }] } : item) })} className="mt-2 flex items-center gap-1 text-xs font-medium text-[#0071e3]"><Plus className="size-3" /> Add bullet</button></div>)}</div>
          {!profile.experiences.length && <button onClick={addExperience} className="mt-3 flex min-h-24 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-black/15 text-sm font-medium text-black/48"><Plus className="size-4" /> Add work experience</button>}

          {profile.education.length > 0 && <div className="mt-7"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Education</p><div className="mt-3 space-y-3">{profile.education.map((item) => <div key={item.id} className="grid gap-3 rounded-[16px] border border-black/[0.07] bg-[#fafafa] p-4 sm:grid-cols-2"><Field label="Qualification" value={item.qualification || item.details} onChange={(value) => updateEducation(item.id, 'qualification', value)} /><Field label="Institution" value={item.institution} onChange={(value) => updateEducation(item.id, 'institution', value)} /><Field label="Start date" value={item.startDate} onChange={(value) => updateEducation(item.id, 'startDate', value)} /><Field label="End date" value={item.endDate} onChange={(value) => updateEducation(item.id, 'endDate', value)} /></div>)}</div></div>}
        </div>
      </div>
      <div className="border-t border-black/[0.06] bg-white px-6 py-5 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div>{quality.usable ? <p className="flex items-center gap-2 text-sm text-green-700"><UserCheck className="size-4" /><strong>Ready to confirm.</strong> We found {profile.experiences.length} role{profile.experiences.length === 1 ? '' : 's'}, {quality.bulletCount} experience bullet{quality.bulletCount === 1 ? '' : 's'}, and {profile.skills.length} skill{profile.skills.length === 1 ? '' : 's'}.</p> : <div><p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><CircleAlert className="size-4" />A little information is missing</p><p className="mt-1 text-xs text-black/45">{quality.problems.join(' ')}</p></div>}<p className="mt-1 text-[11px] text-black/32">{parseMode === 'openrouter' ? 'AI-assisted extraction, grounded against your uploaded text.' : 'Review the extracted information carefully before continuing.'}</p></div><Button onClick={onConfirm} disabled={loading !== null || !quality.usable} className="h-12 rounded-full bg-[#1d1d1f] px-6 hover:bg-black">{loading === 'confirm' ? <LoaderCircle className="animate-spin" /> : <Check />} {confirmed ? 'Confirmed — continue below' : 'Everything looks right'}</Button></div>
        {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600"><CircleAlert className="size-4 shrink-0" />{error}</p>}
      </div>
    </CardContent></Card>
  </section>;
}

function OriginalCV({ file, url, sourceText }: { file: UploadedResumeFile | null; url: string; sourceText: string }) {
  const isPdf = file?.mimeType === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf');
  if (isPdf && url) return <iframe title="Your original uploaded CV" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="h-[720px] w-full rounded-[12px] border border-black/10 bg-white shadow-sm" />;
  return <div className="h-[720px] overflow-auto rounded-[12px] border border-black/10 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2 rounded-[10px] bg-blue-50 px-3 py-2 text-xs text-blue-700"><FileSearch className="size-4" />{file?.name.toLowerCase().endsWith('.docx') ? 'Word files are shown as extracted text here. Open the original above to see its exact formatting.' : 'Extracted text from your uploaded CV.'}</div><pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-slate-700">{sourceText || 'No readable text was found in this document.'}</pre></div>;
}

function EditorScreen({ resume, sourceFile, sourcePreviewUrl, sourceText, company, jobTitle, changeCount, writerUsed, analysis, loading, error, setResume, onBack, onReset, onExportPdf, onExportDocx }: { resume: ResumeVersion; sourceFile: UploadedResumeFile | null; sourcePreviewUrl: string; sourceText: string; company: string; jobTitle: string; changeCount: number; writerUsed: string; analysis: AnalysisResult | null; loading: LoadingState; error: string; setResume: (resume: ResumeVersion) => void; onBack: () => void; onReset: () => void; onExportPdf: () => void; onExportDocx: () => void }) {
  const [previewMode, setPreviewMode] = useState<'updated' | 'original'>('updated');
  const updatePersonal = (key: keyof ResumeVersion['personal'], value: string) => setResume({ ...resume, personal: { ...resume.personal, [key]: value } });
  const updateExperience = (id: string, key: 'company' | 'jobTitle' | 'startDate' | 'endDate', value: string) => setResume({ ...resume, experiences: resume.experiences.map((item) => item.id === id ? { ...item, [key]: value } : item) });
  const updateBullet = (experienceId: string, bulletId: string, text: string) => setResume({ ...resume, experiences: resume.experiences.map((experience) => experience.id === experienceId ? { ...experience, bullets: experience.bullets.map((bullet) => bullet.id === bulletId ? { ...bullet, text } : bullet) } : experience) });
  const isPdf = sourceFile?.mimeType === 'application/pdf' || sourceFile?.name.toLowerCase().endsWith('.pdf');
  return <main id="cv-editor" className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
    <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f5f5f7]/88 backdrop-blur-2xl"><div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between gap-3 px-5 sm:px-8"><button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black"><ArrowLeft className="size-4" /> Requirements</button><div className="flex items-center gap-2"><Button variant="outline" onClick={onExportPdf} disabled={loading === 'export-pdf'} className="rounded-full border-black/10 bg-white"><FileText /> {loading === 'export-pdf' ? 'Preparing…' : 'Download PDF'}</Button><Button onClick={onExportDocx} disabled={loading === 'export-docx'} className="rounded-full bg-[#0071e3]"><Download /> {loading === 'export-docx' ? 'Preparing…' : 'Download DOCX'}</Button></div></div></header>
    <section className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[13px] font-semibold text-[#0071e3]">{analysis?.provider === 'openrouter' ? 'Your tailored CV' : 'Your source CV draft'}</p><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.045em] sm:text-[42px]">Review for {jobTitle || 'the role'}{company ? ` at ${company}` : ''}.</h1><p className="mt-2 text-sm text-black/45">Your original stays unchanged. Review the draft before applying.</p></div><Button variant="ghost" onClick={onReset} className="w-fit rounded-full"><RotateCcw /> Start another job</Button></div>
      <output className={`mt-6 block rounded-[16px] border px-4 py-3 ${analysis?.provider === 'openrouter' ? 'border-green-100 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="text-sm font-semibold">{analysis?.provider === 'openrouter' ? `AI rewrite received · ${changeCount} edits applied` : 'AI tailoring did not complete'}</p>
        <p className="mt-1 text-sm">{analysis?.warning || 'Review the rewritten content against your original CV. Automated checks cannot guarantee every claim.'}</p>
        <p className="mt-1 text-xs text-black/55">{analysis?.provider === 'openrouter' ? 'Writing model' : 'Requested model'}: {writerUsed}</p>
        {analysis?.provider !== 'openrouter' && <p className="mt-2 text-xs">Only source formatting and ordering are available below. <button className="font-semibold underline" onClick={onBack}>Return to requirements to retry</button>.</p>}
      </output>
      {analysis && <JobFitNotes analysis={analysis} />}
      {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600"><CircleAlert className="size-4 shrink-0" />{error}</p>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Card className="apple-card h-fit"><CardContent className="p-5 sm:p-6"><h2 className="font-semibold">Edit your tailored CV</h2><p className="mt-1 text-xs text-black/40">Changes appear in the preview immediately.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Full name" value={resume.personal.fullName} onChange={(value) => updatePersonal('fullName', value)} /><Field label="Professional title" value={resume.personal.professionalTitle} onChange={(value) => updatePersonal('professionalTitle', value)} /><Field label="Email" value={resume.personal.email} onChange={(value) => updatePersonal('email', value)} /><Field label="Phone" value={resume.personal.phone} onChange={(value) => updatePersonal('phone', value)} /><Field label="Location" value={resume.personal.location} onChange={(value) => updatePersonal('location', value)} /><Field label="LinkedIn" value={resume.personal.linkedIn} onChange={(value) => updatePersonal('linkedIn', value)} /><Field label="Portfolio" value={resume.personal.portfolio} onChange={(value) => updatePersonal('portfolio', value)} /><Field label="GitHub" value={resume.personal.github} onChange={(value) => updatePersonal('github', value)} /></div>
          <label className="mt-5 block text-xs font-medium text-black/50">Summary<Textarea value={resume.summary} onChange={(event) => setResume({ ...resume, summary: event.target.value })} className="mt-2 min-h-28 rounded-[14px] border-black/10 text-sm leading-6" /></label>
          <SkillsEditor key={JSON.stringify(resume.skills)} skills={resume.skills} onChange={(skills) => setResume({ ...resume, skills })} />
          <div className="mt-7 space-y-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/35">Experience</p>{resume.experiences.map((experience, index) => <div key={experience.id} className="rounded-[16px] border border-black/[0.07] bg-[#fafafa] p-4"><p className="mb-3 text-xs font-semibold text-black/40">Role {index + 1}</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Job title" value={experience.jobTitle} onChange={(value) => updateExperience(experience.id, 'jobTitle', value)} /><Field label="Company" value={experience.company} onChange={(value) => updateExperience(experience.id, 'company', value)} /><Field label="Start" value={experience.startDate} onChange={(value) => updateExperience(experience.id, 'startDate', value)} /><Field label="End" value={experience.endDate} onChange={(value) => updateExperience(experience.id, 'endDate', value)} /></div><div className="mt-3 space-y-2">{experience.bullets.map((bullet) => <Textarea key={bullet.id} value={bullet.text} onChange={(event) => updateBullet(experience.id, bullet.id, event.target.value)} className="min-h-16 rounded-[12px] border-black/10 bg-white text-xs leading-5" />)}</div></div>)}</div>
        </CardContent></Card>
        <div className="h-fit rounded-[22px] bg-[#e8e8ed] p-4 sm:p-6 xl:sticky xl:top-[88px]">
          <div className="mb-4 flex items-center justify-between gap-3"><div className="inline-flex rounded-full bg-black/[0.07] p-1"><button onClick={() => setPreviewMode('updated')} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${previewMode === 'updated' ? 'bg-white text-black shadow-sm' : 'text-black/45'}`}><Eye className="size-3.5" /> Updated CV</button><button onClick={() => setPreviewMode('original')} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${previewMode === 'original' ? 'bg-white text-black shadow-sm' : 'text-black/45'}`}><FileSearch className="size-3.5" /> Original upload</button></div>{previewMode === 'original' && sourcePreviewUrl && <a href={sourcePreviewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-[#0071e3]">Open <ExternalLink className="size-3" /></a>}</div>
          <div className="max-h-[calc(100vh-145px)] overflow-auto rounded-[14px]">{previewMode === 'updated' ? <ResumePreview resume={resume} /> : isPdf && sourcePreviewUrl ? <iframe title="Original uploaded CV" src={`${sourcePreviewUrl}#toolbar=0&navpanes=0&view=FitH`} className="h-[calc(100vh-155px)] min-h-[700px] w-full bg-white" /> : <div className="min-h-[900px] bg-white p-8"><pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-slate-700">{sourceText}</pre></div>}</div>
        </div>
      </div>
    </section>
  </main>;
}

function StepHeading({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return <div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-xs font-semibold text-white">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-5 text-black/42">{subtitle}</p></div></div>;
}

function JobFitNotes({ analysis }: { analysis: AnalysisResult }) {
  const supported = analysis.matchAnalysis.items.filter(item => item.status === 'strong');
  const gaps = analysis.matchAnalysis.items.filter(item => item.status !== 'strong').filter(item => {
    const requirement = analysis.jobAnalysis.requirements.find(req => req.id === item.requirementId);
    // A list of example languages is an alternative, not four separate obligations.
    return !requirement || !/at least one|e\.g\.|such as/i.test(requirement.evidenceText) || !supported.some(match => analysis.jobAnalysis.requirements.find(req => req.id === match.requirementId)?.evidenceText === requirement.evidenceText);
  });
  return <div className="mt-4 rounded-[16px] border border-black/[0.07] bg-white p-4 text-sm leading-6">
    <p><strong>Supported in your CV:</strong> {supported.map(item => item.label).join(', ') || 'No direct keyword matches found; review the source experience.'}.</p>
    {gaps.length > 0 && <p className="mt-1"><strong>Not established by your CV:</strong> {gaps.map(item => item.label).join(', ')}. These are not added as qualifications.</p>}
    {analysis.jobAnalysis.yearsOfExperience.length > 0 && <p className="mt-1"><strong>Experience requirement:</strong> {analysis.jobAnalysis.yearsOfExperience.map(line => line.replace(/^[*\s-]+/, '').replace(/\*\*/g, '')).join(' ')} We preserve your actual dates; we do not assume that you meet this threshold.</p>}
  </div>;
}

function SkillsEditor({ skills, onChange }: { skills: MasterProfile['skills']; onChange: (skills: MasterProfile['skills']) => void }) {
  const categories = [...new Set(skills.map(skill => skill.category || 'General'))];
  const value = categories.map(category => `${category}: ${skills.filter(skill => (skill.category || 'General') === category).map(skill => skill.name).join(', ')}`).join('\n');
  const [draft, setDraft] = useState(value);
  return <label className="mt-4 block text-xs font-medium text-black/50">Skills by category<Textarea value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => onChange(parseSkills(draft.split('\n')).map(skill => ({...skill, id: skills.find(old => old.name.toLowerCase() === skill.name.toLowerCase())?.id ?? skill.id, confirmedByUser: true})))} className="mt-2 min-h-32 rounded-[14px] border-black/10 text-sm leading-6" /><span className="mt-1 block text-[11px] text-black/40">One category per line. Changes apply when you leave this field.</span></label>;
}

function SimpleHeader() {
  return <header className="border-b border-black/[0.055] bg-white/72 backdrop-blur-2xl"><div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[11px] bg-[#0071e3] text-white shadow-[0_6px_18px_rgb(0_113_227/24%)]"><FileCheck2 className="size-[19px]" /></span><span className="text-[17px] font-semibold tracking-[-0.02em]">TailorCV</span></div><span className="flex items-center gap-1.5 text-xs text-black/40"><ShieldCheck className="size-4 text-[#34c759]" /> Private & truthful</span></div></header>;
}

function ResumeDropzone({ loading, error, onFile }: { loading: boolean; error: string; onFile: (file: File) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const receive = (file?: File) => { setDragActive(false); if (file && !loading) onFile(file); };
  return <div>
    <button type="button" aria-label="Upload your CV" onClick={() => document.getElementById('resume-file-input')?.click()} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files?.[0]); }} className={`flex min-h-60 w-full flex-col items-center justify-center rounded-[20px] border border-dashed px-5 py-8 text-center transition ${dragActive ? 'border-[#0071e3] bg-blue-50 shadow-[0_0_0_4px_rgb(0_113_227/8%)]' : 'border-black/15 bg-[#fafafa] hover:border-[#0071e3]/45 hover:bg-blue-50/35'} ${loading ? 'cursor-wait opacity-75' : ''}`}>
      <span className="grid size-14 place-items-center rounded-[18px] bg-white text-[#0071e3] shadow-[0_8px_24px_rgb(0_0_0/8%)]">{loading ? <LoaderCircle className="size-6 animate-spin" /> : <Upload className="size-6" />}</span><span className="mt-4 text-base font-semibold">{loading ? 'Reading every section…' : 'Drop your CV here'}</span><span className="mt-1.5 text-sm leading-5 text-black/40">{loading ? 'This can take a moment for detailed PDFs.' : 'or click to choose a file'}</span><span className="mt-4 rounded-full bg-black/[0.045] px-3 py-1 text-[10px] font-medium text-black/40">PDF, DOCX, TXT · 8 MB max</span>
    </button>
    <input id="resume-file-input" className="sr-only" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={loading} onChange={(event) => receive(event.target.files?.[0])} />
    {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-600"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>}
  </div>;
}

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-xs font-medium text-black/50">{label}<Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-10 rounded-[13px] border-black/10 bg-white" /></label>;
}
