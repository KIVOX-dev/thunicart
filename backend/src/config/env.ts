import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const PLACEHOLDER = 'REPLACE_ME';
const isPlaceholder = (v: string | undefined) => v === undefined || v === '' || v.includes(PLACEHOLDER);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  X_ZOHO_CATALYST_LISTEN_PORT: z.coerce.number().int().optional(),
  API_URL: z.string().default('http://localhost:4000'),
  STOREFRONT_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:5173'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  MONGODB_URI: z.string().default(PLACEHOLDER),
  MONGODB_DB_NAME: z.string().default('thunikart'),

  JWT_ACCESS_SECRET: z.string().default(PLACEHOLDER),
  JWT_REFRESH_SECRET: z.string().default(PLACEHOLDER),

  B2_KEY_ID: z.string().default(PLACEHOLDER),
  B2_APPLICATION_KEY: z.string().default(PLACEHOLDER),
  B2_ENDPOINT: z.string().default(PLACEHOLDER),
  B2_REGION: z.string().default(PLACEHOLDER),
  B2_BUCKET_MEDIA: z.string().default(PLACEHOLDER),
  B2_BUCKET_BACKUPS: z.string().default(PLACEHOLDER),
  B2_PUBLIC_BASE_URL: z.string().default(PLACEHOLDER),

  RAZORPAY_KEY_ID: z.string().default(PLACEHOLDER),
  RAZORPAY_KEY_SECRET: z.string().default(PLACEHOLDER),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(PLACEHOLDER),

  SHIPROCKET_EMAIL: z.string().default(PLACEHOLDER),
  SHIPROCKET_PASSWORD: z.string().default(PLACEHOLDER),

  BREVO_API_KEY: z.string().default(PLACEHOLDER),
  BREVO_SENDER_EMAIL: z.string().default(PLACEHOLDER),
  BREVO_SENDER_NAME: z.string().default('Thunikart'),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(3),

  GOOGLE_CLIENT_ID: z.string().default(PLACEHOLDER),
  GOOGLE_CLIENT_SECRET: z.string().default(PLACEHOLDER),
  VAPID_PUBLIC_KEY: z.string().default(PLACEHOLDER),
  VAPID_PRIVATE_KEY: z.string().default(PLACEHOLDER),
  CRON_SECRET: z.string().default(PLACEHOLDER),
  SENTRY_DSN: z.string().default(''),

  // Seed only: first Admin account. Never used at runtime by the API.
  SEED_ADMIN_EMAIL: z.string().default('thunikartbykrishnasorchids@gmail.com'),
  SEED_ADMIN_NAME: z.string().default('Thunikart Admin'),
  SEED_ADMIN_PASSWORD: z.string().default(PLACEHOLDER),
});

export type Env = z.infer<typeof schema>;

export interface MockFlags {
  database: boolean;
  payments: boolean;
  storage: boolean;
  email: boolean;
  shipping: boolean;
  googleAuth: boolean;
}

export interface Config extends Env {
  port: number;
  isProd: boolean;
  /** Which outside services run through their mock twin because keys are still REPLACE_ME. */
  mock: MockFlags;
  warnings: string[];
}

const REQUIRED_IN_PRODUCTION = [
  'MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_ENDPOINT', 'B2_REGION',
  'B2_BUCKET_MEDIA', 'B2_BUCKET_BACKUPS', 'B2_PUBLIC_BASE_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'CRON_SECRET',
] as const;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';
  const warnings: string[] = [];

  if (isProd) {
    const missing = REQUIRED_IN_PRODUCTION.filter((k) => isPlaceholder(env[k] as string));
    if (missing.length) {
      throw new Error(`Refusing to start in production. These variables are missing or still REPLACE_ME: ${missing.join(', ')}`);
    }
    if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
      throw new Error('Refusing to start in production. JWT secrets must be at least 32 characters.');
    }
  }

  // In development, placeholder JWT secrets become random per-process secrets (tokens die on restart).
  const cfg: Env = { ...env };
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (isPlaceholder(cfg[k])) {
      cfg[k] = randomBytes(32).toString('hex');
      warnings.push(`${k} is REPLACE_ME: using a random secret for this process. Logins reset on restart.`);
    }
  }

  const mock: MockFlags = {
    database: isPlaceholder(env.MONGODB_URI),
    payments: [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET].some(isPlaceholder),
    storage: [env.B2_KEY_ID, env.B2_APPLICATION_KEY, env.B2_ENDPOINT, env.B2_BUCKET_MEDIA].some(isPlaceholder),
    email: [env.BREVO_API_KEY, env.BREVO_SENDER_EMAIL].some(isPlaceholder),
    shipping: [env.SHIPROCKET_EMAIL, env.SHIPROCKET_PASSWORD].some(isPlaceholder),
    googleAuth: [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET].some(isPlaceholder),
  };
  for (const [name, on] of Object.entries(mock)) {
    if (on && name !== 'database') warnings.push(`${name} runs in MOCK mode (keys are REPLACE_ME).`);
  }

  return {
    ...cfg,
    port: env.X_ZOHO_CATALYST_LISTEN_PORT ?? env.PORT,
    isProd,
    mock,
    warnings,
  };
}

let cached: Config | undefined;
export const config = (): Config => (cached ??= loadConfig());
export const resetConfigForTests = (c?: Config) => { cached = c; };
export const isPlaceholderValue = isPlaceholder;
