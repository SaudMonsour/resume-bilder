import { getChatGPTUser } from '@/app/chatgpt-auth';

export async function getApiUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  // The local Sites runtime does not forward workspace identity headers. Keep
  // local development usable with a stable sandbox identity; hosted requests
  // still use the dispatcher-provided ChatGPT user.
  if (process.env.NODE_ENV === 'development') {
    return { userId: 'local-user', email: 'local@tailorcv.test', displayName: 'Local user', fullName: 'Local user' };
  }
  throw new Error('AUTH_REQUIRED');
}

export function apiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  const status = message === 'AUTH_REQUIRED' ? 401 : 400;
  return Response.json({ error: message === 'AUTH_REQUIRED' ? 'Sign in is required.' : message }, { status });
}
