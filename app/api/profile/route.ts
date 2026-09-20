import { env } from 'cloudflare:workers';
import { masterProfileSchema } from '@/lib/domain/schema';
import { getDevStore } from '@/lib/dev-store';
import { apiError, getApiUser } from '@/lib/server-user';

export async function GET() {
  try {
    const user = await getApiUser();
    const row = await env.DB.prepare(`SELECT profile_json FROM master_profiles WHERE user_id = ? LIMIT 1`).bind(user.userId).first<{ profile_json: string }>();
    const file = await env.DB.prepare(`
      SELECT id, file_name, mime_type
      FROM uploaded_files
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(user.userId).first<{ id: string; file_name: string; mime_type: string }>();
    return Response.json({
      profile: row ? masterProfileSchema.parse(JSON.parse(row.profile_json)) : null,
      file: file ? { id: file.id, name: file.file_name, mimeType: file.mime_type } : null,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development' && error instanceof Error && !error.message.includes('AUTH_REQUIRED')) return Response.json({ profile: getDevStore().profile, file: null });
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getApiUser();
    const profile = masterProfileSchema.parse(await request.json());
    const now = new Date().toISOString();
    const id = `master_${user.userId}`;
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`).bind(user.userId, user.email, user.displayName, now, now),
        env.DB.prepare(`INSERT INTO master_profiles (id, user_id, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`).bind(id, user.userId, JSON.stringify({ ...profile, updatedAt: now }), now, now),
      ]);
    } catch (error) {
      if (process.env.NODE_ENV !== 'development') throw error;
      getDevStore().profile = profile;
    }
    return Response.json({ ok: true, updatedAt: now });
  } catch (error) {
    return apiError(error);
  }
}
