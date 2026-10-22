import { z } from 'zod';

// Variables this application reads today. Later tasks add their own here,
// and every name must also appear in .env.example.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce
      .number({ error: 'must be a port number' })
      .int('must be a port number')
      .min(1, 'must be a port number')
      .max(65535, 'must be a port number'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_DIR: z.string(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
    // Comma-separated browser origins allowed to call the API cross-origin:
    // the Vite dev server and review deployments. Production is same-origin.
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url({ protocol: /^https?$/ }))),
    // Raw value; resolved below. Anything other than exactly "live" means console.
    EMAIL_MODE: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    BREVO_SENDER_EMAIL: z.email().optional(),
    BREVO_SENDER_NAME: z.string().optional(),
    // Brevo's free plan allows 300 emails a day, shared with production.
    BREVO_DAILY_CAP: z.coerce.number().int().positive().default(300),
    // Directory holding one <courseId>/course-bundle.json per mission, emitted
    // by the frontend build. Progress is worked out against it.
    CONTENT_BUNDLE_PATH: z.string(),
    // AI mentor (Saral) — Google GenAI SDK via Vertex AI
    GOOGLE_CLOUD_PROJECT: z.string().min(1),
    GOOGLE_CLOUD_LOCATION: z.string().min(1).default('global'),
    AI_MODEL: z.string().min(1),
    // Directory holding system-prompt.txt, <courseId>.content.txt and
    // <courseId>.code.txt for the Saral mentor.
    SARAL_BLOCK_PATH: z.string(),
    // Max messages a learner may send per day across all missions.
    // Budget arithmetic (Gemini Flash Lite pricing):
    //   ~3000 input tokens + ~150 output tokens per exchange
    //   20 messages/learner/day is a reasonable ceiling
    SARAL_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
    // Max prior messages (both roles) replayed into each model call.
    SARAL_HISTORY_CAP: z.coerce.number().int().positive().default(20),
    // Langfuse tracing for Saral. Both keys unset means no tracing. The secret
    // key is a credential: .env only.
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://cloud.langfuse.com'),
    // Where chapter feedback notifications go.
    FEEDBACK_RECIPIENT_EMAIL: z.email().optional(),
    // The Apps Script web app that appends attempt rows. A credential: whoever
    // holds it can write to the client's sheet. Unset means no sync.
    GOOGLE_SCRIPT_URL: z.url({ protocol: /^https$/ }).optional(),
    // The sheet itself, for people and log lines only. Never used to write.
    GOOGLE_SHEET_URL: z.url({ protocol: /^https$/ }).optional(),
  })
  .superRefine((env, ctx) => {
    // Half a key pair is a typo, not a decision to turn tracing off.
    if ((env.LANGFUSE_PUBLIC_KEY === undefined) !== (env.LANGFUSE_SECRET_KEY === undefined)) {
      const missing =
        env.LANGFUSE_PUBLIC_KEY === undefined ? 'LANGFUSE_PUBLIC_KEY' : 'LANGFUSE_SECRET_KEY';
      ctx.addIssue({
        code: 'custom',
        path: [missing],
        message: 'is required when the other Langfuse key is set',
      });
    }
    if (env.EMAIL_MODE !== 'live') {
      return;
    }
    for (const key of [
      'BREVO_API_KEY',
      'BREVO_SENDER_EMAIL',
      'BREVO_SENDER_NAME',
      'FEEDBACK_RECIPIENT_EMAIL',
    ] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'is required when EMAIL_MODE=live' });
      }
    }
  })
  .transform(({ EMAIL_MODE, ...env }) => ({
    ...env,
    // Live sending is an explicit decision, never a default or an accident.
    EMAIL_MODE: EMAIL_MODE === 'live' ? ('live' as const) : ('console' as const),
    EMAIL_MODE_UNRECOGNISED:
      EMAIL_MODE !== undefined && EMAIL_MODE !== 'live' && EMAIL_MODE !== 'console',
  }));

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  // An empty value (`PORT=`) counts as missing, so a copied .env.example fails loudly.
  const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(env);
  if (result.success) {
    return result.data;
  }

  // The logger depends on config, so this is the one place that writes to stderr directly.
  // Messages name the variable but never echo its value.
  const lines = result.error.issues.map((issue) => {
    const name = issue.path.map(String).join('.');
    const problem = env[issue.path[0] as string] === undefined ? 'is required' : issue.message;
    return `  ${name}: ${problem}`;
  });
  process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

export const config = loadConfig();

/** Preset avatar ids shipped with the frontend; any other id is rejected. */
export const PRESET_AVATAR_IDS = ['male-1', 'male-2', 'female-1', 'female-2'] as const;
