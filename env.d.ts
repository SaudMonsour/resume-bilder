declare namespace Cloudflare {
  interface Env {
    FILES: R2Bucket;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_AGENT_MODEL?: string;
    OPENROUTER_WRITING_MODEL?: string;
    OPENROUTER_BASE_URL?: string;
    OPENROUTER_SITE_URL?: string;
  }
}
