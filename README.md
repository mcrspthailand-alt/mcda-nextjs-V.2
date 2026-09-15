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

- Price is configurable by environment; default is 59.00 THB.
- 7 days from verified payment time.
- All 13 analysis models unlocked.
- Unlimited analysis operations while the subscription is active.

Payment orders and subscriptions are stored in PostgreSQL. Bank-slip verification is performed server-to-server through AMS Payment Gateway. The AMS API key must never be exposed to the browser.

## Payment configuration

Required production environment variables:

```env
AMS_GATEWAY_BASE_URL=https://ams-gateway.micro-support.com
AMS_GATEWAY_API_KEY=ams_...
AMS_SERVICE_CODE=<assigned-service-code>

# Premium Weekly price in THB. Defaults to 59.00 if omitted.
MCDA_PREMIUM_WEEKLY_PRICE_THB=59.00

# Choose one PromptPay proxy type: phone or national_id
MCDA_PROMPTPAY_TYPE=national_id
MCDA_PROMPTPAY_ID=<13-digit-national-id-or-tax-id>
```

`MCDA_PREMIUM_WEEKLY_PRICE_THB` accepts a positive THB amount with up to 2 decimal places, for example `49`, `59.00`, or `79.50`. Changing it affects **new payment orders** after the service is redeployed/restarted. Existing orders keep the amount stored when they were created, so their QR and slip verification continue to use the original order amount.

For a mobile-number PromptPay receiver use:

```env
MCDA_PROMPTPAY_TYPE=phone
MCDA_PROMPTPAY_ID=0836777796
```

For a National ID / Tax ID PromptPay receiver use:

```env
MCDA_PROMPTPAY_TYPE=national_id
MCDA_PROMPTPAY_ID=1234567890123
```

`MCDA_PROMPTPAY_ID` is server-side only and must not be exposed through a `NEXT_PUBLIC_*` variable. The billing API returns only a masked PromptPay identifier to the browser.

The standard Thai PromptPay Tag 29 generator supports:

- mobile number via PromptPay sub-tag `01`
- National ID / Tax ID via PromptPay sub-tag `02`
- MCDA order reference embedded in Additional Data Field Template `62`, sub-tag `05`

The amount stored on each payment order is encoded into the QR and is also used as the expected amount for AMS slip verification. The order reference is generated server-side and included in the QR. Payment acceptance remains server-side through the selected payment order, expected amount/currency, AMS verification result, duplicate status, and provider transaction reference uniqueness.

Backward-compatible variables `MCDA_PROMPTPAY_PHONE` and `MCDA_PROMPTPAY_NATIONAL_ID` are also accepted, but the preferred configuration is `MCDA_PROMPTPAY_TYPE` + `MCDA_PROMPTPAY_ID`.

See `docs/PROMPTPAY_QR_IMPLEMENTATION.md` for payload details.

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
