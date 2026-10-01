# AMS relay POST routing and recovery

## What was wrong

`app/api/webhooks/ams/route.ts` already exported POST. End-user session middleware still intercepted it. Older code redirected unauthenticated requests to `/auth/sign-in`; a redirect that preserves POST can end at an HTML page that does not accept POST and report 405. The latest pre-fix middleware returned JSON 401 instead, but still prevented AMS from reaching the handler. The reported production 405 cannot by itself identify which deployed revision or proxy produced it.

This fix delegates only the exact `/api/webhooks/ams` pathname to route-level server-to-server authentication. It does not exempt all webhook/API paths or accept a user cookie as payment authentication.

## Authentication: MCDA callback capability extension

The supplied AMS guide specifies relay event/provider/delivery headers, not an authenticated signature for the AMS-to-MCDA hop. Those public header names are not proof of origin. This implementation therefore introduces a **per-order bearer callback token** in the custom `webhook_url` that MCDA already sends to AMS. This is an MCDA extension, not a claim that AMS currently signs its relay body.

```text
MCDA backend -> AMS Hosted Checkout (webhook_url with order_id and token)
Stripe -> AMS (Stripe signature verified by AMS)
AMS -> the stored full webhook_url -> MCDA POST handler
```

```text
https://<configured-public-MCDA-origin>/api/webhooks/ams?order_id=<external_reference>&token=<per-order-capability>
```

The token is HMAC-SHA256 over a domain-separated tuple containing AMS service code and order reference, using the existing MCDA `AUTH_SECRET`. Neither AUTH_SECRET nor the AMS API key is sent in the callback URL. MCDA still uses no Stripe key, Stripe.js or direct Stripe webhook.

The token is a bearer credential, **not a signature of the event body**. TLS and confidentiality of the full callback URL are required. Do not expose it in customer APIs, screenshots, source code, support tickets or public logs. Restrict AMS delivery/activity records to trusted operators and redact query tokens in AMS/proxy access logs. The MCDA gateway adapter logs correlation fields only. Do not rotate AUTH_SECRET, AMS service code, origin or payment settings while attempts are outstanding without reconciling/recovering those attempts first.

A plain POST to the old bare URL now receives JSON 401 with `AMS_RELAY_UNAUTHENTICATED`, not a login redirect. An authorized accepted POST receives JSON 200. GET intentionally returns JSON 405 and `Allow: POST`; testing by opening the endpoint in a browser does not test POST support.

## Acceptance and persistence

After authenticating the callback capability, MCDA checks AMS provider/type/delivery headers, event ID/date, service metadata, order reference, persisted AMS payment identity and relevant Checkout/PaymentIntent identities. It checks mode against the stored Checkout Session ID. Paid events require exact integer minor-unit amount and THB currency.

Supported paid events:

- `checkout.session.completed` with `payment_status=paid`.
- `checkout.session.async_payment_succeeded` with paid status.
- `payment_intent.succeeded` with succeeded status and exact `amount_received`.

Unpaid completion does not activate membership. Processing/failure/expiry events cannot overwrite a settled paid/refunded order. Both Stripe event ID and AMS delivery ID are deduplicated. The order is locked, event recorded and subscription created in the same PostgreSQL transaction. Success is returned only after COMMIT; a database failure returns JSON 5xx so the original event can be retried. A delivery that arrives before the local AMS/session identity is saved returns 503 instead of being acknowledged and lost. Refund reconciliation is unchanged and is not implemented by this patch.

## Migration and existing attempts

The migration is additive: `payment_events.delivery_id` gains a unique partial index; existing payment orders receive `ams_webhook_auth_version=0`. Only orders newly inserted by the new application explicitly get version 1 and send the authenticated callback URL.

**Do not silently regenerate a Checkout Session to change the webhook URL.** Existing orders may have remote state even when local IDs are null after a timeout. For this reason, starting Checkout on a legacy version-0 order returns JSON 409 `AMS_LEGACY_CHECKOUT_REVIEW_REQUIRED` before calling AMS. The patch does not automatically cancel, refund, mark paid, expire, replace or create a second transaction. Existing subscriptions and pricing are not changed. After the operator confirms an old unpaid attempt is terminal, the ordinary order lifecycle may create a new order; do not reset the migration marker merely to bypass the check.

## Recover deliveries that already exhausted retries

1. Deploy the reviewed MCDA revision with its existing AUTH_SECRET, AMS_SERVICE_CODE and correct HTTPS NEXT_PUBLIC_APP_URL. An admin account must be in MCDA_ADMIN_EMAILS.
2. While authenticated as that admin, read:

   ```text
   GET /api/admin/ams-relay-url?order_id=<external_reference>
   ```

   This read-only endpoint returns the tokenized webhook URL and stored payment/session IDs. It does not change any payment, order, queue or entitlement. Ordinary users get 403.
3. Compare the stored identifiers and original event against the AMS payment record. If `requiresIdentityReconciliation=true`, reconcile the missing local identity using verified AMS records before replay; never infer paid from a return URL or an HTTP 200 Checkout response.
4. In AMS's authorized operations tooling, update the **existing delivery's endpoint_url** to the full returned URL and replay/requeue the **original Stripe event**. A saved failed delivery will otherwise retain its old bare URL. Preserve the original event ID and payment/session/reference. Do not call `checkout-sessions` or charge again just to resend a webhook.
5. Expect JSON 200 `{ "received": true }` (or `duplicate: true` for an already processed event), then verify the MCDA order/subscription and AMS delivery state. Invalid capability returns 401; inconsistent payment identity/amount returns 422; incomplete local persistence or unavailable configuration/database returns 503/5xx. Investigate those responses rather than returning unconditional 200.

The provided AMS job defaults to five attempts. Changing MCDA code does not automatically revive a delivery that has exhausted them. Gateway configuration and production replay are operator actions, not performed by this PR.

## Validation

`tests/ams-relay.test.mjs` exercises the real handler with in-memory database adapters: cookie-free authenticated POST, token isolation, amount/mode/identity rejection, checkout event variants, duplicate delivery/event, ordering of success/failure and rollback. These are not a live PostgreSQL or real-payment test.

The build workflow retains Checkout error regression tests, builds Next.js/Docker, and runs `tests/ams-relay-http-smoke.mjs` against the actual local Docker HTTP server. The smoke asserts unauthenticated POST -> JSON 401, authenticated non-financial no-op POST -> JSON 200 with no cookie or redirect, and GET -> 405 Allow: POST. It sends no payment event and makes no external AMS/Stripe transaction.

Production AMS delivery, allow-list/query retention, log redaction and real payment reconciliation still require verification in the deployed environment.
