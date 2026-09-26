export const FALLBACK_WEEKLY_PLAN_PRICE_THB = '59.00';

export function normalizePlanAmount(value: unknown) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Plan price must be a positive THB amount with at most 2 decimal places');
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const decimals = (match[2] ?? '').padEnd(2, '0');
  if (/^0+$/.test(whole) && decimals === '00') throw new Error('Plan price must be greater than 0');
  return `${whole}.${decimals}`;
}

export function getConfiguredWeeklyPlanPrice() {
  return normalizePlanAmount(
    process.env.MCDA_PREMIUM_WEEKLY_PRICE_THB || FALLBACK_WEEKLY_PLAN_PRICE_THB,
  );
}