import test from 'node:test';
import assert from 'node:assert/strict';
import { getConfiguredWeeklyPlanPrice, normalizePlanAmount } from '../lib/membership-config.ts';

const base = 'MCDA_PREMIUM_WEEKLY_PRICE_THB';
const keys = [base, `${base}_EASYSLIP`, `${base}_STRIPE`];
function prices(t, legacy, easyslip, stripe) {
  const original = keys.map(key => process.env[key]);
  [legacy, easyslip, stripe].forEach((value, i) => {
    if (value === undefined) delete process.env[keys[i]];
    else process.env[keys[i]] = value;
  });
  t.after(() => original.forEach((value, i) => {
    if (value === undefined) delete process.env[keys[i]];
    else process.env[keys[i]] = value;
  }));
}

for (const [name, values, expected] of [
  ['no configuration', [], ['59.00', '59.00']],
  ['legacy configuration only', ['79.5'], ['79.50', '79.50']],
  ['two independent prices', ['59', '49.50', '69.25'], ['49.50', '69.25']],
  ['EasySlip override only', ['59', '39'], ['39.00', '59.00']],
  ['Stripe override only', ['59', undefined, '99'], ['59.00', '99.00']],
  ['overrides without legacy price', [undefined, '29', '79'], ['29.00', '79.00']],
  ['blank optional prices', ['59', '  ', ''], ['59.00', '59.00']],
  ['trim values and normalize satang', ['59', ' 049.5 ', ' 069 '], ['49.50', '69.00']],
  ['unused invalid legacy price', ['invalid', '49', '69'], ['49.00', '69.00']],
]) {
  test(name, t => {
    prices(t, ...values);
    assert.equal(getConfiguredWeeklyPlanPrice('easyslip'), expected[0]);
    assert.equal(getConfiguredWeeklyPlanPrice('stripe'), expected[1]);
    assert.equal(getConfiguredWeeklyPlanPrice(), expected[1]);
  });
}
for (const invalid of ['0', '-1', '59.999', 'NaN', 'Infinity', '1e2', '1,000', 'abc']) {
  test(`invalid channel price rejects instead of silently falling back: ${invalid}`, t => {
    prices(t, '59', invalid, '69');
    assert.throws(() => getConfiguredWeeklyPlanPrice('easyslip'));
    assert.equal(getConfiguredWeeklyPlanPrice('stripe'), '69.00');
    process.env[`${base}_EASYSLIP`] = '49';
    process.env[`${base}_STRIPE`] = invalid;
    assert.throws(() => getConfiguredWeeklyPlanPrice('stripe'));
    assert.equal(getConfiguredWeeklyPlanPrice('easyslip'), '49.00');
  });
}
test('an invalid legacy fallback is not silently accepted', t => {
  prices(t, 'invalid');
  assert.throws(() => getConfiguredWeeklyPlanPrice('easyslip'));
  assert.throws(() => getConfiguredWeeklyPlanPrice('stripe'));
});
test('runtime changes are read per call without leaking across channels', t => {
  prices(t, '59', '49', '69');
  process.env[`${base}_EASYSLIP`] = '39.75';
  assert.equal(getConfiguredWeeklyPlanPrice('easyslip'), '39.75');
  assert.equal(getConfiguredWeeklyPlanPrice('stripe'), '69.00');
  process.env[`${base}_STRIPE`] = '89';
  assert.equal(getConfiguredWeeklyPlanPrice('easyslip'), '39.75');
  assert.equal(getConfiguredWeeklyPlanPrice(), '89.00');
});
test('amount normalization retains satang exactly', () => {
  assert.equal(normalizePlanAmount('000.01'), '0.01');
  assert.equal(normalizePlanAmount('00059.10'), '59.10');
});
