import { env } from 'cloudflare:workers';
import { applicationSchema } from '@/lib/domain/schema';
import { getDevStore } from '@/lib/dev-store';
import { apiError, getApiUser } from '@/lib/server-user';

export async function GET() {
  try {
    const user = await getApiUser();
    const result = await env.DB.prepare(`SELECT application_json FROM job_applications WHERE user_id = ? ORDER BY created_at DESC`).bind(user.userId).all<{ application_json: string }>();
    const applications = result.results.map((row) => applicationSchema.parse(JSON.parse(row.application_json)));
    return Response.json({ applications });
  } catch (error) {
    if (process.env.NODE_ENV === 'development' && error instanceof Error && !error.message.includes('AUTH_REQUIRED')) return Response.json({ applications: getDevStore().applications });
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const application = applicationSchema.parse(await request.json());
    const now = new Date().toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`).bind(user.userId, user.email, user.displayName, now, now),
        env.DB.prepare(`INSERT INTO job_applications (id, user_id, company, job_title, status, match_score, application_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET company = excluded.company, job_title = excluded.job_title, status = excluded.status, match_score = excluded.match_score, application_json = excluded.application_json, updated_at = excluded.updated_at`).bind(application.id, user.userId, application.company, application.jobTitle, application.status, application.matchAnalysis.overallScore, JSON.stringify(application), application.createdAt, now),
        env.DB.prepare(`INSERT INTO resume_versions (id, application_id, resume_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET resume_json = excluded.resume_json`).bind(`resume_${application.id}`, application.id, JSON.stringify(application.tailoredResume), now),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV !== 'development') throw error;
      getDevStore().applications = [application, ...getDevStore().applications.filter((item) => item.id !== application.id)];
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
