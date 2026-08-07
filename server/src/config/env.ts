import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  DATABASE_URL: z.string().url().startsWith('mysql://'),
  SHADOW_DATABASE_URL: z.string().url().startsWith('mysql://'),
  CLIENT_URL: z.string().url(),
  BUSINESS_TIMEZONE: z.string().min(1).default('Asia/Manila'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) =>
          `- ${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${details}`);
  }

  return result.data;
}
