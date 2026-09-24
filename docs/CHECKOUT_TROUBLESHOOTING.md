# Hosted Checkout: HTML responses and failed sessions

## Scope

The payment architecture remains MCDA -> AMS -> Stripe, then Stripe -> AMS -> MCDA. No Stripe key or SDK is added. Prices and entitlements are unchanged. The success/cancel URLs still carry the order reference and each checkout request sends its MCDA webhook URL.

## Two independent symptoms

An AMS response with HTTP 200, `data.status=failed` and `checkout_url=null` is valid JSON but does not provide a usable checkout. MCDA now returns a JSON 409 `AMS_CHECKOUT_NOT_PAYABLE`, preserving the request ID and order reference. It does not redirect, mark paid, clear session identifiers, retire the order, rotate the key or create another session automatically. A pending response without a URL is reported separately as `AMS_CHECKOUT_URL_UNAVAILABLE`. A null `payment_intent_id` is allowed for a new hosted session.

`Unexpected token '<'` means an HTML response reached a JSON parser somewhere. The provided AMS JSON does not identify which browser request received HTML or which server generated that HTML. Do not claim that Cloudflare, Easypanel or Stripe caused it without capturing the actual response. The billing page now detects JSON media types, parse errors, redirects and missing response objects, and reports safe HTTP/correlation details without displaying an upstream HTML body.

All billing-page response reads use the guard, including order creation, checkout, status polling, pricing and slip verification. The existing status-check button performs a read only. Gateway calls request JSON, do not follow redirects with credentials and have deadlines. Service discovery uses 10 seconds; checkout and slip verification default to 60 seconds (`MCDA_AMS_TIMEOUT_MS`, 5000-90000 ms). Agree timeouts with AMS operations and the ingress limits; an aborted request may already have reached the provider, so retain its original key.

## Investigating the existing failed session

Use the affected order reference, AMS payment ID, checkout session ID and request ID from the operator logs to correlate AMS activity. The normalized `failed` result alone does not prove why the session failed, that it expired, or that no charge exists. AMS operations must inspect the actual Stripe session's `status`, `payment_status`, expiry and any provider error, plus webhook deliveries. Do not fabricate a checkout URL from a session ID or append a random retry key. Only create a replacement payment attempt after the old session/payment is reconciled or confirmed safe to replace, under an explicit recovery operation.

The deterministic request fingerprint is unchanged by this fix. Repeating the same request can repeat the same failed result. A changed fingerprint is not a mechanism to cancel a previous session. No automatic recovery/refund is introduced by this patch.

## Separate release blocker: AMS webhook ingress

At the audited main revision, `middleware.ts` matches `/api/webhooks/ams`. Without an end-user session it redirects to HTML sign-in. This patch changes protected API failures to JSON 401, while keeping existing access boundaries. It does **not** silently expose an unsigned payment-settlement endpoint or claim webhook delivery is repaired.

The existing relay handler checks event headers/metadata but those values alone do not authenticate a sender. Before making the endpoint public, establish an authenticated AMS-to-MCDA ingress (a documented signed relay contract or a correctly enforced trusted network/proxy boundary), then exempt that exact endpoint from user-login middleware. This needs no Stripe key in MCDA. Verify rejection of forged deliveries and acceptance of genuine AMS deliveries in staging. The attached guide also lists Hosted Checkout session events; audit those separately because the current handler primarily processes `payment_intent.*`.

## Validation

`node --experimental-strip-types --test tests/checkout-errors.test.mjs`

The regression suite tests HTML 200/404/502/504, malformed JSON, redirects/401, failed/null AMS data, pending/null, valid pending checkout with null PaymentIntent, URL safety, the real checkout route with mocked session/gateway/database adapters, stable retry payloads, session conflicts, conditional order writes and privacy-safe gateway logging. These are not live Stripe/AMS transactions. The normal CI build additionally compiles Next.js, builds/runs Docker and checks container health. A successful build does not validate payment settlement or production deployment.
