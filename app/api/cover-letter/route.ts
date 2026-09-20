import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createAIService } from '@/lib/ai/service';
import { masterProfileSchema } from '@/lib/domain/schema';
import { apiError, getApiUser } from '@/lib/server-user';

const requestSchema = z.object({
  profile: masterProfileSchema,
  company: z.string().max(200),
  jobTitle: z.string().max(200),
  jobDescription: z.string().max(80_000),
});

export async function POST(request: Request) {
  try {
    await getApiUser();
    const body = requestSchema.parse(await request.json());
    const service = createAIService(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    const coverLetter = await service.generateCoverLetter(body.profile, body.company, body.jobTitle, body.jobDescription);
    return Response.json({ coverLetter });
  } catch (error) {
    return apiError(error);
  }
}
