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
export const DEFAULT_WEEKLY_PLAN_DAYS = 7;
export const DEFAULT_WEEKLY_PLAN_PRICE_THB = '59.00';

export type MembershipPlan = {
  code: string;
  title: string;
  priceThb: string;
  durationDays: number;
  isActive: boolean;
};

function normalizePlanAmount(value: unknown) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Plan price must be a positive THB amount with at most 2 decimal places');
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const decimals = (match[2] ?? '').padEnd(2, '0');
  if (/^0+$/.test(whole) && decimals === '00') throw new Error('Plan price must be greater than 0');
  return `${whole}.${decimals}`;
}

function publicPlan(row: {
  code: string;
  title: string;
  price_thb: string;
  duration_days: number;
  is_active: boolean;
}): MembershipPlan {
  return {
    code: row.code,
    title: row.title,
    priceThb: normalizePlanAmount(row.price_thb),
    durationDays: Number(row.duration_days),
    isActive: Boolean(row.is_active),
  };
}

export async function getWeeklyPlan(): Promise<MembershipPlan> {
  await ensureMembershipSchema();
  const result = await getPool().query<{
    code: string;
    title: string;
    price_thb: string;
    duration_days: number;
    is_active: boolean;
  }>(
    `
      SELECT code, title, price_thb::text, duration_days, is_active
      FROM membership_plans
      WHERE code = $1
      LIMIT 1
    `,
    [WEEKLY_PLAN_CODE],
  );

  const row = result.rows[0];
  if (!row) {
    return {
      code: WEEKLY_PLAN_CODE,
      title: 'MCDA Premium Weekly',
      priceThb: DEFAULT_WEEKLY_PLAN_PRICE_THB,
      durationDays: DEFAULT_WEEKLY_PLAN_DAYS,
      isActive: true,
    };
  }
  return publicPlan(row);
}

export async function updateWeeklyPlan(input: { priceThb: unknown; durationDays?: unknown }) {
  await ensureMembershipSchema();
  const current = await getWeeklyPlan();
  const priceThb = normalizePlanAmount(input.priceThb);
  const durationDays = input.durationDays === undefined
    ? current.durationDays
    : Number(input.durationDays);

  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
    throw new Error('Plan duration must be an integer from 1 to 3650 days');
  }

  const result = await getPool().query<{
    code: string;
    title: string;
    price_thb: string;
    duration_days: number;
    is_active: boolean;
  }>(
    `
      UPDATE membership_plans
      SET price_thb = $2::numeric,
          duration_days = $3,
          updated_at = NOW()
      WHERE code = $1
      RETURNING code, title, price_thb::text, duration_days, is_active
    `,
    [WEEKLY_PLAN_CODE, priceThb, durationDays],
  );
  return publicPlan(result.rows[0]);
}

function planPriceLabel(value: string) {
  return value.endsWith('.00') ? value.slice(0, -3) : value;
}

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

  const [plan, subscriptionResult, usageResult] = await Promise.all([
    getWeeklyPlan(),
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
      weeklyPriceThb: plan.priceThb,
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
    weeklyPriceThb: plan.priceThb,
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
        message: `โมเดลที่เลือกบางรายการเป็น Premium กรุณาอัปเกรดแพ็กเกจ ${planPriceLabel(entitlements.weeklyPriceThb)} บาท`,
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
      message: `โควตาวิเคราะห์ฟรีครบ 10 ครั้งสำหรับวันนี้แล้ว กรุณากลับมาใหม่พรุ่งนี้หรืออัปเกรด Premium ${planPriceLabel(entitlements.weeklyPriceThb)} บาท`,
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
