# MCDA Trial and Redeem Codes

## Scope

Application-managed, no-card Premium trial plus admin-issued Premium-day codes. These are MCDA entitlements, not Stripe coupons, AMS Checkout Credits, or AMS direct Trial Offers. No Stripe/AMS requests are made and no fake paid orders are recorded. The existing payment providers, price ENV settings and webhook verification remain unchanged.

## Enable in the MCDA service Environment

```dotenv
MCDA_TRIAL_ENABLED=true
MCDA_TRIAL_DAYS=7
MCDA_REDEEM_ENABLED=true
MCDA_ADMIN_EMAILS=admin@your-company.example
```

Use your real administrator email, already registered and verified in MCDA. Keep `NEXT_PUBLIC_APP_URL` set to the canonical public origin; new mutations require a matching browser `Origin`. Do not put trial/redeem configuration into `NEXT_PUBLIC_*` variables.

`MCDA_TRIAL_ENABLED` defaults to **false** when absent, so deploying this feature does not silently launch a promotion. `MCDA_TRIAL_DAYS` defaults to **7**, accepts integers 1–365. `MCDA_REDEEM_ENABLED` defaults to **true**. Booleans accept `true`/`false` (case insensitive); malformed configuration fails closed. Restart/redeploy after changing service ENV.

Changing days affects **future trial claims only**. Disabling either feature blocks new claims but does not remove existing grants, reset eligibility, extend a trial, or change its stored expiry. No renewal, card registration, automatic charge or cron job is required.

## Member workflow

Open `/billing`, sign in, and use the “ทดลองใช้งานและรับสิทธิ์ด้วยโค้ด” section.

### Trial

The clock starts only when the member presses “เริ่มทดลองฟรี”. A verified existing Free account can claim too; this is not a registration-date promotion. An account with active Premium cannot start a trial. An expired former paid account can claim if it has never claimed a trial. Each account can claim once for its lifetime; eligibility is tied to the MCDA account, not a real-world person or device. Deleting/recreating an account or registering multiple verified accounts is not prevented by this feature.

A trial provides the same model/usage entitlements as Premium. Expiry is enforced by the existing server-side `getEntitlements()` subscription checks. At expiry, the account returns to Free unless another active entitlement exists. The claim is never reset by logging out or changing ENV. Repeated POSTs return the original receipt without adding time.

### Redeem

Paste a code and submit. Case, spaces and hyphens are normalized. One code can be used once per account. Different codes may each be used if their conditions allow it. If Premium is active at redemption time, code days are appended after its current latest expiry; otherwise they start immediately. Existing entitlements are not shortened or overwritten.

The code's expiry is the deadline to **claim** it, not the end of the granted Premium period. Deactivating a code or disabling redemption does not revoke previously granted days. This feature does not change the existing start-date/overlap policy for later Stripe/EasySlip purchases; paid Checkout is still the pre-existing one-time fixed-duration flow, not a recurring subscription with a deferred charge.

## Admin workflow

Open `/admin` → “Trial และ Redeem codes” or `/admin/redeem-codes`.

Create a campaign with a title, Premium duration (1–3650 days), maximum participating accounts (1–1,000,000), optional claim deadline, and optional verified recipient email. Dates entered on the page are explicitly Thailand time (UTC+7), stored as timezone-aware instants and displayed in Asia/Bangkok.

Leave the code blank to generate a code with 96 cryptographically random bits. The full code is displayed once after creation; copy it before leaving. Only a SHA-256 hash and masked hint are stored. Custom codes accept 8–64 ASCII letters/digits excluding spaces/hyphens. Use generated codes for private grants; short recognizable campaign codes can be guessed and are better treated as public promotions.

The list shows usage, conditions and status. Click the used/maximum count to inspect redemptions (25 per page). Disable a code to stop new claims; re-enabling does not reset usage or its expiry. Durations/limits are immutable after creation: issue a new code rather than rewriting a code already distributed. There is no delete endpoint. Creation and status changes retain actor/time audit records.

If a creation response is lost, do not assume a code was not created. Check the list and disable the inaccessible generated code before creating a replacement; the server cannot recover its plaintext.

## API

All endpoints require a valid signed session and a current verified database user. Admin endpoints also recheck `MCDA_ADMIN_EMAILS` against that database user. JSON mutation bodies are bounded to 4096 bytes and same-origin. Responses are private/no-store.

| Endpoint | Method | Input |
|---|---|---|
| `/api/account/benefits` | GET | Current eligibility, entitlement and latest 10 redemptions |
| `/api/account/benefits` | POST | `{"action":"trial"}` |
| `/api/account/benefits` | POST | `{"action":"redeem","code":"..."}` |
| `/api/admin/redeem-codes?page=1` | GET | 25 codes per page |
| `/api/admin/redeem-codes?codeId=<id>&page=1` | GET | 25 redemption records per page |
| `/api/admin/redeem-codes` | POST | `title`, `days`, `maxRedemptions`, optional `code`, `expiresAt`, `allowedEmail` |
| `/api/admin/redeem-codes` | PATCH | `{"id":"<id>","active":false}` |

Trial duration and target account are never accepted from the browser. Expected failures use stable `error.code` values; unknown/expired/exhausted/email-mismatched codes share `REDEEM_UNAVAILABLE`. `RATE_LIMITED` responds 429 with `Retry-After: 600`. Retry the same claim/code after `BENEFITS_BUSY`; ledger keys prevent double granting.

## Database and concurrency

`lib/membership-benefits-schema.ts` adds idempotent schema setup following the repository's existing runtime-migration pattern. First use creates `membership_trial_claims`, `membership_redeem_codes`, `membership_redemptions`, `membership_benefit_limits`, and `membership_code_audit`. The DB role needs the same create-table/index privileges required by existing schema initializers. No existing rows are backfilled into a trial and no existing tables/columns are dropped.

Claims use one transaction for entitlement, receipt and code-counter changes. Member `FOR NO KEY UPDATE` locks serialize concurrent reward grants on an account; code `FOR UPDATE` locks serialize the last remaining redemption across accounts. Database unique constraints enforce one trial/account and one redemption/code/account. Code expiry is checked again after acquiring the code lock. Transactions have bounded lock/statement timeouts. Rate-limit writes are committed outside the claim transaction, so an invalid-code rollback does not refund an attempt (10 trial/redeem attempts per account/action/10 minutes; 30 admin mutations/10 minutes).

Grant times use database time with 24-hour day intervals; durations are stored in claims. Codes grant real subscription entitlements using distinct plan codes `mcda_premium_trial` and `mcda_premium_redeem`, with no `payment_order_id`. Revenue still comes only from actual paid orders. Back up new tables with the existing application database; do not reset/drop the trial ledger to end a promotion.

## Validation and rollout

```sh
node --test tests/benefits-unit.test.mjs
MCDA_BENEFITS_TEST_DATABASE_URL=postgresql://<disposable-test-db> \
  node --test tests/benefits-postgres.test.mjs
npm run build
```

The PostgreSQL test requires a disposable database role with CREATE SCHEMA privilege. It makes a random test schema, uses the actual application schema initializers and entitlement resolver, and drops only that test schema afterward. It intentionally does not default to production `DATABASE_URL`. The `Membership benefits` GitHub Actions workflow supplies a PostgreSQL 16 service. Existing billing/navigation CI remains unchanged.

Before production, validate a Free verified account, an existing Premium account, duplicate trial calls, expiry, code capacity, email-bound code, disabled code, last-use contention, admin access, and a real browser session at desktop/mobile sizes. Use staging/test accounts; there is no need to create a real payment for the trial/redeem smoke test. Deploy with the trial disabled first, check DB/schema and admin page, then enable it via ENV. Roll back promotion availability by setting the switches false; retain the ledger and already-granted entitlement rows.
