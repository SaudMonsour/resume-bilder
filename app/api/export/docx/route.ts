import { resumeVersionSchema } from '@/lib/domain/schema';
import { apiError, getApiUser } from '@/lib/server-user';
import { createResumeDocx } from '@/lib/export/docx';

export async function POST(request: Request) {
  try {
    await getApiUser();
    const resume = resumeVersionSchema.parse(await request.json());
    const bytes = createResumeDocx(resume);
    const safeName = resume.personal.fullName.replace(/[^a-zA-Z0-9_-]+/g, '-');
    return new Response(bytes as unknown as BodyInit, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}.docx"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return apiError(error); }
}
