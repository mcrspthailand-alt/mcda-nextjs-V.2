import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';

export const ALL_MCDA_MODELS = Object.freeze([
  'topsis',
  'saw',
  'promethee',
  'vikor',
  'moora',
  'waspas',
  'edas',
  'electre',
  'copras',
  'aras',
  'gra',
  'wpm',
  'distance',
] as const);

export const FREE_MCDA_MODELS = Object.freeze([
  'topsis',
  'promethee',
  'moora',
  'electre',
] as const);

export const FREE_DAILY_ANALYSIS_LIMIT = 10;
export const WEEKLY_PLAN_CODE = 'mcda_weekly_unlimited';
export const WEEKLY_PLAN_DAYS = 7;

const DEFAULT_WEEKLY_PLAN_PRICE_THB = '59.00';

function normalizeWeeklyPlanPrice(value: string | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_WEEKLY_PLAN_PRICE_THB;

  const match = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error('MCDA_PREMIUM_WEEKLY_PRICE_THB must be a positive THB amount with at most 2 decimal places');
  }

  const whole = BigInt(match[1]);
  const decimals = (match[2] ?? '').padEnd(2, '0');
  const satang = whole * 100n + BigInt(decimals);
  if (satang <= 0n) {
    throw new Error('MCDA_PREMIUM_WEEKLY_PRICE_THB must be greater than 0');
  }

  return `${whole.toString()}.${decimals}`;
}

/**
 * Weekly Premium price, resolved server-side from the environment.
 * Defaults to 59.00 THB when the variable is not configured.
 */
export const WEEKLY_PLAN_PRICE_THB = normalizeWeeklyPlanPrice(
  process.env.MCDA_PREMIUM_WEEKLY_PRICE_THB,
);

export const WEEKLY_PLAN_PRICE_LABEL = WEEKLY_PLAN_PRICE_THB.endsWith('.00')
  ? WEEKLY_PLAN_PRICE_THB.slice(0, -3)
  : WEEKLY_PLAN_PRICE_THB;

export type PlanTier = 'free' | 'premium';

export type Entitlements = {
  plan: PlanTier;
  planCode: string | null;
  premiumUntil: string | null;
  allowedModels: string[];
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  usageDate: string;
  weeklyPriceThb: string;
};

function bangkokDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  await ensureMembershipSchema();
  const pool = getPool();
  const usageDate = bangkokDateKey();

  const [subscriptionResult, usageResult] = await Promise.all([
    pool.query<{
      plan_code: string;
      ends_at: Date;
    }>(
      `
        SELECT plan_code, ends_at
        FROM subscriptions
        WHERE user_id = $1
          AND status = 'active'
          AND starts_at <= NOW()
          AND ends_at > NOW()
        ORDER BY ends_at DESC
        LIMIT 1
      `,
      [userId],
    ),
    pool.query<{ analysis_count: number }>(
      `
        SELECT analysis_count
        FROM analysis_usage
        WHERE user_id = $1 AND usage_date = $2::date
      `,
      [userId, usageDate],
    ),
  ]);

  const active = subscriptionResult.rows[0];
  const usedToday = Number(usageResult.rows[0]?.analysis_count ?? 0);

  if (active) {
    return {
      plan: 'premium',
      planCode: active.plan_code,
      premiumUntil: new Date(active.ends_at).toISOString(),
      allowedModels: [...ALL_MCDA_MODELS],
      dailyLimit: null,
      usedToday,
      remainingToday: null,
      usageDate,
      weeklyPriceThb: WEEKLY_PLAN_PRICE_THB,
    };
  }

  return {
    plan: 'free',
    planCode: null,
    premiumUntil: null,
    allowedModels: [...FREE_MCDA_MODELS],
    dailyLimit: FREE_DAILY_ANALYSIS_LIMIT,
    usedToday,
    remainingToday: Math.max(0, FREE_DAILY_ANALYSIS_LIMIT - usedToday),
    usageDate,
    weeklyPriceThb: WEEKLY_PLAN_PRICE_THB,
  };
}

export type AnalysisAuthorization =
  | { ok: true; entitlements: Entitlements }
  | {
      ok: false;
      status: 400 | 403 | 429;
      code: 'INVALID_MODELS' | 'PREMIUM_MODEL_REQUIRED' | 'DAILY_LIMIT_REACHED';
      message: string;
      entitlements: Entitlements;
      lockedModels?: string[];
    };

export async function authorizeAnalysis(
  userId: string,
  requestedModels: unknown,
): Promise<AnalysisAuthorization> {
  const entitlements = await getEntitlements(userId);

  if (!Array.isArray(requestedModels)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_MODELS',
      message: 'กรุณาเลือกโมเดลที่ต้องการวิเคราะห์',
      entitlements,
    };
  }

  const models = [...new Set(requestedModels.filter((model): model is string => typeof model === 'string'))];
  const invalid = models.filter((model) => !ALL_MCDA_MODELS.includes(model as (typeof ALL_MCDA_MODELS)[number]));

  if (!models.length || invalid.length) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_MODELS',
      message: invalid.length
        ? `พบโมเดลที่ไม่รองรับ: ${invalid.join(', ')}`
        : 'กรุณาเลือกอย่างน้อย 1 โมเดล',
      entitlements,
    };
  }

  if (entitlements.plan === 'free') {
    const allowed = new Set<string>(FREE_MCDA_MODELS);
    const lockedModels = models.filter((model) => !allowed.has(model));
    if (lockedModels.length) {
      return {
        ok: false,
        status: 403,
        code: 'PREMIUM_MODEL_REQUIRED',
        message: `โมเดลที่เลือกบางรายการเป็น Premium กรุณาอัปเกรดแพ็กเกจ ${WEEKLY_PLAN_PRICE_LABEL} บาท / 7 วัน`,
        entitlements,
        lockedModels,
      };
    }
  }

  const pool = getPool();
  const usageDate = entitlements.usageDate;

  if (entitlements.plan === 'premium') {
    const result = await pool.query<{ analysis_count: number }>(
      `
        INSERT INTO analysis_usage (user_id, usage_date, analysis_count, updated_at)
        VALUES ($1, $2::date, 1, NOW())
        ON CONFLICT (user_id, usage_date)
        DO UPDATE SET
          analysis_count = analysis_usage.analysis_count + 1,
          updated_at = NOW()
        RETURNING analysis_count
      `,
      [userId, usageDate],
    );

    return {
      ok: true,
      entitlements: {
        ...entitlements,
        usedToday: Number(result.rows[0]?.analysis_count ?? entitlements.usedToday + 1),
      },
    };
  }

  const result = await pool.query<{ analysis_count: number }>(
    `
      INSERT INTO analysis_usage (user_id, usage_date, analysis_count, updated_at)
      VALUES ($1, $2::date, 1, NOW())
      ON CONFLICT (user_id, usage_date)
      DO UPDATE SET
        analysis_count = analysis_usage.analysis_count + 1,
        updated_at = NOW()
      WHERE analysis_usage.analysis_count < $3
      RETURNING analysis_count
    `,
    [userId, usageDate, FREE_DAILY_ANALYSIS_LIMIT],
  );

  if (!result.rowCount) {
    return {
      ok: false,
      status: 429,
      code: 'DAILY_LIMIT_REACHED',
      message: `โควตาวิเคราะห์ฟรีครบ 10 ครั้งสำหรับวันนี้แล้ว กรุณากลับมาใหม่พรุ่งนี้หรืออัปเกรด Premium ${WEEKLY_PLAN_PRICE_LABEL} บาท / 7 วัน`,
      entitlements: {
        ...entitlements,
        usedToday: FREE_DAILY_ANALYSIS_LIMIT,
        remainingToday: 0,
      },
    };
  }

  const usedToday = Number(result.rows[0].analysis_count);
  return {
    ok: true,
    entitlements: {
      ...entitlements,
      usedToday,
      remainingToday: Math.max(0, FREE_DAILY_ANALYSIS_LIMIT - usedToday),
    },
  };
}
