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

- 59 THB for 7 days from verified payment time.
- All 13 analysis models unlocked.
- Unlimited analysis operations while the subscription is active.

Payment orders and subscriptions are stored in PostgreSQL. Bank-slip verification is performed server-to-server through AMS Payment Gateway. The AMS API key must never be exposed to the browser.

## Payment configuration

Required production environment variables:

```env
AMS_GATEWAY_BASE_URL=https://ams-gateway.micro-support.com
AMS_GATEWAY_API_KEY=ams_...
AMS_SERVICE_CODE=<assigned-service-code>
MCDA_PROMPTPAY_PHONE=<10-digit-Thai-mobile-number>
```

`MCDA_PROMPTPAY_PHONE` must be the real Thai mobile number registered for the PromptPay receiver. It stays server-side and is used to build a standard Thai PromptPay EMVCo QR payload with the fixed order amount (59.00 THB).

The current billing flow no longer uses the merchant-specific `|biller-id\rref1\rref2\ramount-minor-unit` QR format. Standard mobile PromptPay QR does not embed `ref1/ref2`; order association and payment acceptance are enforced server-side through the selected payment order, expected amount/currency, AMS verification result, duplicate status, and provider transaction reference uniqueness.

See `docs/PROMPTPAY_QR_IMPLEMENTATION.md` for the payload details.

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
