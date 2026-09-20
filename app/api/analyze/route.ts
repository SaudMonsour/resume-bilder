import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createAIService } from '@/lib/ai/service';
import { DEFAULT_OPENROUTER_WRITING_MODEL, generateWithOpenRouter, providerFailure } from '@/lib/ai/openrouter';
import { masterProfileSchema } from '@/lib/domain/schema';
import { apiError, getApiUser } from '@/lib/server-user';

const requestSchema = z.object({
  profile: masterProfileSchema,
  jobDescription: z.string().min(20).max(80_000),
  jobTitle: z.string().max(200).default(''),
});

export async function POST(request: Request) {
  try {
    await getApiUser();
    const body = requestSchema.parse(await request.json());
    const service = createAIService(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    const jobAnalysis = await service.analyzeJobDescription(body.jobDescription, body.jobTitle);
    const matchAnalysis = await service.compareResumeToJob(body.profile, jobAnalysis);
    let plan = await service.generateTailoredResume(body.profile, jobAnalysis, matchAnalysis);
    let provider = 'deterministic';
    let warning = 'AI writing is not configured. This is a formatted draft of your source CV, not an AI-tailored result.';
    if (env.OPENROUTER_API_KEY) {
      try {
        plan = await generateWithOpenRouter({
          apiKey: env.OPENROUTER_API_KEY,
          agentModel: env.OPENROUTER_AGENT_MODEL,
          writingModel: env.OPENROUTER_WRITING_MODEL,
          baseUrl: env.OPENROUTER_BASE_URL,
          siteUrl: env.OPENROUTER_SITE_URL,
          appName: 'TailorCV',
        }, body.profile, body.jobDescription, jobAnalysis, matchAnalysis);
        provider = 'openrouter';
        warning = '';
      } catch (error) {
        // Preserve the deterministic, evidence-safe result if a free endpoint is busy or unavailable.
        warning = providerFailure(error);
        console.warn('OpenRouter tailoring fallback:', warning);
      }
    }
    return Response.json({ jobAnalysis, matchAnalysis, ...plan, provider, warning, writingModel: env.OPENROUTER_WRITING_MODEL || DEFAULT_OPENROUTER_WRITING_MODEL });
  } catch (error) {
    return apiError(error);
  }
}
