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

- Price and duration are stored in PostgreSQL `membership_plans`.
- Initial seed is 59.00 THB / 7 days.
- Authorized admins can change price/duration from `/billing` without redeploying.
- All 13 analysis models unlocked.
- Unlimited analysis operations while the subscription is active.

Payment orders and subscriptions are stored in PostgreSQL. The primary Stripe flow is AMS Hosted Checkout. MCDA never receives or stores Stripe API keys, Stripe.js publishable keys, or Stripe webhook secrets.

## Payment configuration

Required production environment variables:

```env
AMS_GATEWAY_BASE_URL=https://ams-gateway.micro-support.com
AMS_GATEWAY_API_KEY=ams_...
AMS_SERVICE_CODE=<assigned-service-code>
AMS_STRIPE_PAYMENT_METHODS=card,promptpay

# Accounts allowed to edit Premium price/duration from /billing
MCDA_ADMIN_EMAILS=admin@example.com
```

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

The existing Standard Thai PromptPay QR + AMS/EasySlip verification remains available as a fallback payment path.

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
docker build -t mcda-nextjs-v2 .
docker run --rm -p 3000:3000 --env-file .env mcda-nextjs-v2
```

The existing `/api/health` endpoint can be used as the container health check.
