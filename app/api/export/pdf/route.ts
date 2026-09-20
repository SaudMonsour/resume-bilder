import { resumeVersionSchema } from '@/lib/domain/schema';
import { apiError, getApiUser } from '@/lib/server-user';
import { createResumePdf } from '@/lib/export/pdf';

export async function POST(request: Request) {
  try {
    await getApiUser();
    const resume = resumeVersionSchema.parse(await request.json());
    const bytes = await createResumePdf(resume);
    const safeName = resume.personal.fullName.replace(/[^a-zA-Z0-9_-]+/g, '-');
    return new Response(bytes as unknown as BodyInit, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return apiError(error); }
}
