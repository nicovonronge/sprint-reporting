import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const configSchema = z.object({
  JIRA_BASE_URL: z.string().url(),
  JIRA_EMAIL: z.string().email(),
  JIRA_API_TOKEN: z.string().min(1, 'JIRA_API_TOKEN is required'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1, 'CLAUDE_CODE_OAUTH_TOKEN is required (run `claude setup-token`)'),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Missing or invalid environment variables:\n${missing}\n\nSee .env.example for required values.`);
    process.exit(1);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function getPartialConfig(): Partial<Config> {
  return configSchema.partial().parse(process.env);
}
