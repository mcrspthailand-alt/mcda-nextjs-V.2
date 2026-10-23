# MCDA Next.js V.2

Next.js migration of the MCDA multi-method decision analysis application.

## Analysis models

The engine supports 13 matrix-compatible methods:

- SAW
- WPM
- Distance Target
- MOORA
- WASPAS
- ARAS
- COPRAS
- EDAS
- GRA
- TOPSIS
- VIKOR
- PROMETHEE II
- ELECTRE I

It includes comparative ranking, complexity-ordered Rank Movement, grayscale Sensitivity Analysis, descriptive interpretation, Excel/CSV features, and selected-model PDF reporting.

## Authentication and membership

The application requires a signed-in account.

### Free

- 10 Generate/analysis operations per account per Bangkok calendar day.
- Available models: TOPSIS, PROMETHEE II, MOORA, ELECTRE I.
- One validated click on **Analyze + Sensitivity** counts as one operation, regardless of how many allowed free models are selected.

### Premium Weekly

- Independent prices: `MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP` for direct QR/slip, and `MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE` for Hosted Checkout.
- Each unset/blank channel price falls back to `MCDA_PREMIUM_WEEKLY_PRICE_THB`, then 59.00 THB.
- Duration is stored in PostgreSQL `membership_plans` and authorized admins can change it from `/billing` without redeploying. Both channels grant the same duration and features.
- All 13 analysis models unlocked.
- Unlimited analysis operations while the subscription is active.

Payment orders and subscriptions are stored in PostgreSQL. The primary Stripe flow is AMS Hosted Checkout. MCDA never receives or stores Stripe API keys, Stripe.js publishable keys, or Stripe webhook secrets.

## AMS Gateway integration guide

For the end-to-end client integration flow, Hosted Checkout request contract, webhook relay, idempotency, security rules, error handling, and MCDA reference implementation, see:

- [docs/AMS_GATEWAY_INTEGRATION.md](docs/AMS_GATEWAY_INTEGRATION.md)

## Payment configuration

Required production environment variables:

```env
AMS_GATEWAY_BASE_URL=https://ams-gateway.micro-support.com
AMS_GATEWAY_API_KEY=ams_...
AMS_SERVICE_CODE=<assigned-service-code>
AMS_STRIPE_PAYMENT_METHODS=card,promptpay

# Accounts allowed to edit Premium duration from /billing
MCDA_ADMIN_EMAILS=admin@example.com

# Backward-compatible common fallback
MCDA_PREMIUM_WEEKLY_PRICE_THB=59.00

# Optional independent channel prices (blank = use the common fallback)
MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP=
MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE=
```

### Different EasySlip and Stripe prices

For example, to charge **59 THB via EasySlip** and **69 THB via Stripe**, set these two values in the **MCDA app service's Environment** in Easypanel (not in the AMS Gateway service):

```env
MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP=59.00
MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE=69.00
```

These are illustrative prices, not automatic production changes. Restart/redeploy the MCDA app with the new environment values after deploying this code. No Stripe key, AMS service price change, or database migration is required for the split-price settings.

`EASYSLIP` means the direct bank-transfer PromptPay QR with an uploaded slip verified by AMS/EasySlip. `STRIPE` applies to **both card and PromptPay inside Stripe Hosted Checkout**. It is the checkout channel, not the bank payment method, that selects the price.

The precedence is independent for each channel: nonblank channel override, then nonblank legacy/common variable, then `59.00`. Prices must be positive decimal THB amounts with at most two decimal places. An invalid nonblank value fails validation instead of silently charging a fallback price. Keep these variables server-side; do not prefix them with `NEXT_PUBLIC_`.

The billing API exposes `plan.pricesThb.easyslip` and `plan.pricesThb.stripe`; the billing page shows both prices and separate payment buttons. Existing `plan.priceThb` and entitlement `weeklyPriceThb` fields continue to represent the primary Stripe price for compatibility.

Each order stores its selected channel price at creation. QR amounts, AMS expected amounts, Checkout requests, and webhook verification use the stored order amount, not a newly changed environment value. Same-click Stripe retries retain their original order amount and idempotency key. New EasySlip orders use `payment_method=promptpay_slip`; new Stripe orders use `stripe_hosted_checkout` before any provider call. Direct QR orders cannot be sent to the Stripe Checkout endpoint, and Stripe orders are never reused as direct QR orders. Existing payment history and paid amounts are not rewritten.

MCDA **must not** be configured with `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET`.

### AMS Hosted Checkout flow

```text
MCDA backend -> AMS Gateway -> Stripe Checkout
Customer     -> redirect to checkout_url
Stripe       -> AMS Stripe webhook
AMS Gateway  -> relay webhook -> MCDA /api/webhooks/ams
```

MCDA creates the local order first, then calls:

```text
POST /api/v1/payments/stripe/checkout-sessions
```

with the server-side amount/currency, order reference, allowed methods, success URL and cancel URL. AMS returns a Stripe `checkout_url`; MCDA redirects the browser to that URL. Returning to the success URL is never treated as proof of payment. Premium is activated only after MCDA receives the matching `payment_intent.succeeded` event through the AMS webhook relay.

The AMS service must have Stripe enabled, the `payments:create` scope, the correct source-IP allowlist, and a default client webhook endpoint configured as:

```text
https://<mcda-domain>/api/webhooks/ams
```

The relay is deduplicated using the Stripe event ID. MCDA also verifies the service metadata, external order reference, amount and currency before changing an order to paid.

### Direct PromptPay + slip fallback

The Standard Thai PromptPay QR + AMS/EasySlip verification is a separate payment choice with its own configured price.

Preferred PromptPay receiver configuration:

```env
MCDA_PROMPTPAY_TYPE=phone
MCDA_PROMPTPAY_ID=0836777796
```

or:

```env
MCDA_PROMPTPAY_TYPE=national_id
MCDA_PROMPTPAY_ID=1234567890123
```

`MCDA_PROMPTPAY_ID` is server-side only. The billing API returns only a masked PromptPay identifier to the browser. The order amount and reference are created server-side and reused during AMS slip verification.

See `docs/PROMPTPAY_QR_IMPLEMENTATION.md` for the fallback QR payload details.

## Local development

Use Node.js **22.23.4 or a later patched 22.x release**. The repository's `.nvmrc`
pins the version used by CI, and the Docker build and runtime share the same
`node:22.23.4-alpine` base. If using nvm, run `nvm install` and `nvm use` before
installing dependencies.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

## Docker / Easypanel

```bash
docker build --pull -t mcda-nextjs-v2 .
docker run --rm -p 3000:3000 --env-file .env mcda-nextjs-v2
```

The existing `/api/health` endpoint can be used as the container health check.

### October 2026 Node.js security update

Node.js 20 reached end of life on 30 April 2026. This project now uses
**22.23.4**, one of the patched releases in the
[21 October 2026 Node.js security announcement](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
The existing CI already used Node.js 22; pinning its patched version also removes
the previous mismatch with the Node.js 20 production container. See the
[official support schedule](https://github.com/nodejs/Release#release-schedule)
when planning the next major upgrade (Node.js 22 support ends 30 April 2027).

After merging this update, rebuild the **MCDA app service** from the updated
Dockerfile and deploy the new image in Easypanel. For a manual clean build use
`docker build --pull --no-cache -t mcda-nextjs-v2 .`. Recreate the running app
container from that image, retaining its existing environment and port mapping.
A restart of the old container, an npm dependency update, or a Node.js update on
the Docker host does not replace the Node.js binary inside the app container.

Verify `node --version` in the **running app container's console** (expected
`v22.23.4` for this image). From the Docker host use
`docker exec <mcda-container-name-or-id> node --version`. Then confirm
`/api/health` returns HTTP 200 and smoke-test sign-in, analysis, trial/redeem and
the payment flow using test accounts/providers. The health endpoint alone does
not report or prove the Node.js version. No database migration is needed for
this runtime update.

For future Node.js 22 patches, update `.nvmrc`, the Docker base tag and the
`package.json` minimum together, then rebuild and verify the deployed container.
CI checks the actual container version against `.nvmrc` in addition to the
existing build, browser, billing and membership tests.

### Framework security patches

The same update pins Next.js to **15.5.28** and keeps React / React DOM together
at **19.1.8**, within their existing minor release lines. The former Next.js
15.5.2 dependency is affected by the
[React Server Components security advisory](https://nextjs.org/blog/CVE-2025-66478);
upgrading Node.js alone does not fix that framework vulnerability. Next.js
15.5.28 is the patched 15.5 release in the
[14 October 2026 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
Continue maintaining Node.js and npm dependencies independently as new security
releases become available.
