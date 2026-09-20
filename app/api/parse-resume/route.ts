import { env } from 'cloudflare:workers';
import { createAIService } from '@/lib/ai/service';
import { parseResumeWithOpenRouter } from '@/lib/ai/openrouter';
import { createId } from '@/lib/domain/ids';
import { extractResumeText } from '@/lib/documents/extract';
import { apiError, getApiUser } from '@/lib/server-user';
import { getDevStore } from '@/lib/dev-store';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const allowed = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Choose a resume file first.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Resume files must be 8 MB or smaller.');
    if (!allowed.has(file.type) && !/\.(pdf|docx|txt)$/i.test(file.name)) throw new Error('Upload a PDF, DOCX, or TXT file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await extractResumeText(bytes, file.type, file.name);
    if (text.length < 20) throw new Error('The file did not contain enough selectable text to parse.');
    const service = createAIService(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    const baseline = await service.parseResume(text);
    let profile = baseline;
    let parseMode = 'basic';
    // A clearly structured source does not need a model to transcribe it again.
    const structured = baseline.experiences.length > 0 && baseline.experiences.every(item => item.company && item.jobTitle && item.bullets.length) && baseline.education.every(item => item.qualification && item.institution);
    if (structured) parseMode = 'structured';
    if (env.OPENROUTER_API_KEY && !structured) {
      try {
        profile = await parseResumeWithOpenRouter({
          apiKey: env.OPENROUTER_API_KEY,
          agentModel: env.OPENROUTER_AGENT_MODEL,
          baseUrl: env.OPENROUTER_BASE_URL,
          siteUrl: env.OPENROUTER_SITE_URL,
          appName: 'TailorCV',
        }, text, baseline);
        parseMode = 'openrouter';
      } catch (error) {
        console.warn('OpenRouter resume parsing fallback:', error instanceof Error ? error.message : 'unknown error');
      }
    }

    const id = createId('file');
    const objectKey = `${user.userId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      await env.FILES.put(objectKey, bytes, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`).bind(user.userId, user.email, user.displayName, now, now),
        env.DB.prepare(`INSERT INTO uploaded_files (id, user_id, object_key, file_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.userId, objectKey, file.name, file.type || 'application/octet-stream', file.size, now),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV !== 'development') throw error;
      getDevStore().profile = profile;
    }
    return Response.json({ profile, file: { id, name: file.name, mimeType: file.type || 'application/octet-stream' }, parseMode });
  } catch (error) {
    return apiError(error);
  }
}
