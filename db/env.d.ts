declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_AGENT_MODEL?: string;
    OPENROUTER_WRITING_MODEL?: string;
    OPENROUTER_BASE_URL?: string;
    OPENROUTER_SITE_URL?: string;
  }
}
