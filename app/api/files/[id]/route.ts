import { env } from 'cloudflare:workers';
import { apiError, getApiUser } from '@/lib/server-user';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const user = await getApiUser();
    const { id } = await context.params;
    const file = await env.DB.prepare(`
      SELECT object_key, file_name, mime_type, size
      FROM uploaded_files
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `).bind(id, user.userId).first<{ object_key: string; file_name: string; mime_type: string; size: number }>();
    if (!file) return Response.json({ error: 'Uploaded CV not found.' }, { status: 404 });
    const object = await env.FILES.get(file.object_key);
    if (!object) return Response.json({ error: 'Uploaded CV is no longer available.' }, { status: 404 });
    const safeName = file.file_name.replace(/["\r\n]/g, '_');
    return new Response(object.body, {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': String(file.size),
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
