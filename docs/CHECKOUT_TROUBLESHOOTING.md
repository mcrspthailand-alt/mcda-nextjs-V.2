# Hosted Checkout: HTML responses and failed sessions

## Scope

The payment architecture remains MCDA -> AMS -> Stripe, then Stripe -> AMS -> MCDA. No Stripe key or SDK is added. Prices and entitlements are unchanged. The success/cancel URLs still carry the order reference and each checkout request sends its MCDA webhook URL.

## Two independent symptoms

An AMS response with HTTP 200, `data.status=failed` and `checkout_url=null` is valid JSON but does not provide a usable checkout. MCDA now returns a JSON 409 `AMS_CHECKOUT_NOT_PAYABLE`, preserving the request ID and order reference. It does not redirect, mark paid, clear session identifiers, retire the order, rotate the key or create another session automatically. A pending response without a URL is reported separately as `AMS_CHECKOUT_URL_UNAVAILABLE`. A null `payment_intent_id` is allowed for a new hosted session.

`Unexpected token '<'` means an HTML response reached a JSON parser somewhere. The provided AMS JSON does not identify which browser request received HTML or which server generated that HTML. Do not claim that Cloudflare, Easypanel or Stripe caused it without capturing the actual response. The billing page now detects JSON media types, parse errors, redirects and missing response objects, and reports safe HTTP/correlation details without displaying an upstream HTML body.

All billing-page response reads use the guard, including order creation, checkout, status polling, pricing and slip verification. The existing status-check button performs a read only. Gateway calls request JSON, do not follow redirects with credentials and have deadlines. Service discovery uses 10 seconds; checkout and slip verification default to 60 seconds (`MCDA_AMS_TIMEOUT_MS`, 5000-90000 ms). Agree timeouts with AMS operations and the ingress limits; an aborted request may already have reached the provider, so retain its original key.

## Investigating the existing failed session

### Generic `AMS_CHECKOUT_REQUEST_FAILED`

This error means the checkout call failed without a usable `error.code` in the AMS response. An upstream JSON response such as Laravel's `{ "message": "...", "errors": { ... } }` previously lost its diagnostic details. The code alone does not establish HTTP 422, a disabled payment method, a Stripe failure, or whether a remote session exists.

The adapter now recognizes unstructured JSON errors. Checkout failures retain the upstream HTTP status, and validation failures expose only these allowlisted field names: `amount`, `currency`, `payment_method_types`, `external_reference`, `description`, `success_url`, `cancel_url`, and `webhook_url`. Nested payment-method indices map to `payment_method_types`. Raw provider messages, submitted values, exception traces and SQL are not forwarded to the browser or debug logs.

For example, a **mocked** Laravel 422 response for `payment_method_types` produces `AMS_VALIDATION_FAILED`, `AMS HTTP 422`, that field name, and the request ID. This identifies the rejected field without guessing that every failure has the same cause.

| Diagnostic | Operator follow-up |
| --- | --- |
| `AMS_VALIDATION_FAILED`, `payment_method_types` | Compare MCDA `AMS_STRIPE_PAYMENT_METHODS` with the methods enabled in the gateway's `STRIPE_PAYMENT_METHOD_TYPES`. |
| `AMS_VALIDATION_FAILED`, a return/webhook URL field | Inspect that request's validation details and DNS resolution from the gateway. |
| `AMS_GATEWAY_AUTH_FAILED` / `AMS_GATEWAY_ACCESS_DENIED` | Inspect gateway authentication, service permissions and access restrictions. The MCDA browser session may still be valid. |
| `AMS_GATEWAY_RATE_LIMITED` | Inspect gateway rate limits and the existing order before retrying. |
| `AMS_GATEWAY_UNAVAILABLE` | Inspect the gateway exception/database/provider logs using the request ID. |

AMS's **Reports > Stripe Failures** page (`/admin/reports/stripe-failures`) can search the request ID and show the captured response. Use the request's date range. In the gateway database, the same evidence is under `request_activities.request_id`, `status_code` and `response_meta.body`. Read the existing record before creating another checkout merely for diagnosis.

This is an error-reporting fix. It preserves checkout payloads, idempotency keys, URL/status validation, prices and payment-state writes. Resolving the production rejection still requires the gateway's actual response for the affected request.

### Failed or incomplete session responses

Use the affected order reference, AMS payment ID, checkout session ID and request ID from the operator logs to correlate AMS activity. The normalized `failed` result alone does not prove why the session failed, that it expired, or that no charge exists. AMS operations must inspect the actual Stripe session's `status`, `payment_status`, expiry and any provider error, plus webhook deliveries. Do not fabricate a checkout URL from a session ID or append a random retry key. Only create a replacement payment attempt after the old session/payment is reconciled or confirmed safe to replace, under an explicit recovery operation.

The deterministic request fingerprint is unchanged by this fix. Repeating the same request can repeat the same failed result. A changed fingerprint is not a mechanism to cancel a previous session. No automatic recovery/refund is introduced by this patch.

## Separate release blocker: AMS webhook ingress

At the audited main revision, `middleware.ts` matches `/api/webhooks/ams`. Without an end-user session it redirects to HTML sign-in. This patch changes protected API failures to JSON 401, while keeping existing access boundaries. It does **not** silently expose an unsigned payment-settlement endpoint or claim webhook delivery is repaired.

The existing relay handler checks event headers/metadata but those values alone do not authenticate a sender. Before making the endpoint public, establish an authenticated AMS-to-MCDA ingress (a documented signed relay contract or a correctly enforced trusted network/proxy boundary), then exempt that exact endpoint from user-login middleware. This needs no Stripe key in MCDA. Verify rejection of forged deliveries and acceptance of genuine AMS deliveries in staging. The attached guide also lists Hosted Checkout session events; audit those separately because the current handler primarily processes `payment_intent.*`.

## Validation

`node --experimental-strip-types --test tests/checkout-errors.test.mjs tests/ams-gateway-errors.test.mjs`

The regression suite tests HTML 200/404/502/504, malformed JSON, redirects/401, failed/null AMS data, pending/null, valid pending checkout with null PaymentIntent, URL safety, the real checkout route with mocked session/gateway/database adapters, stable retry payloads, session conflicts, conditional order writes and privacy-safe gateway logging. These are not live Stripe/AMS transactions. The normal CI build additionally compiles Next.js, builds/runs Docker and checks container health. A successful build does not validate payment settlement or production deployment.
