# Fresh transaction for Card / PromptPay

## User behavior

Each deliberate click on either Hosted Checkout button in `/billing` sends
`POST /api/billing/orders` with `{ "freshCheckout": true, "requestId": "<uuid-v4>" }`.
The authenticated account, current PostgreSQL plan price and duration are authoritative;
the client cannot submit amount, user ID, external reference or callback URL.

The server atomically marks that account's previous `awaiting_payment` orders for this
plan `superseded`, creates a new Order UUID, external reference and payment reference,
and records the click in `checkout_start_requests`. Existing paid, refunded, failed
and expired records are NOT deleted, reset, refunded or reused. Other accounts/plans
are not modified. The Direct PromptPay/slip flow's empty POST is unchanged.

The browser then opens `/api/billing/orders/<NEW_ORDER_ID>/checkout`, which uses the
existing AMS Hosted Checkout adapter, authenticated per-order relay callback and
server-generated success/cancel URLs. A fresh local order has no old AMS payment ID
or Checkout Session ID. Its normal per-order deterministic idempotency key is new.
No Stripe keys are added to MCDA and there are no direct Stripe API calls.

## New click versus retry

A different intentional click gets a different UUID and order. Repeating the same
POST payload with the same `requestId` for the same account returns the original
active order without clearing again, even after an admin changes plan pricing.
An already superseded, expired or paid click cannot be resurrected. The browser
blocks overlapping clicks and does not automatically retry either POST.

An active Premium subscription or a known `processing`, `requires_action`, `pending`,
`manual_review` or `payment_unknown` payment blocks creation with JSON 409. New order
creation never proves that the old payment failed or that no money moved. After a
network failure, check payment state before deliberately starting another payment.

## Important: local retirement is not remote cancellation

This change clears the selected local transaction and prevents its normal local
reuse. It does NOT expire an already issued Stripe Checkout URL or remove an AMS
record. The available AMS contract does not expose a verified expire-session API.
An old Stripe link may remain payable. Use only the newest link and do not pay again
if money was deducted. To invalidate old remote links automatically, AMS must expose
an authenticated, service-scoped session-status/expiration operation; verify that the
old session is unpaid and expired before creating its replacement. Do not fabricate
such an endpoint, change Stripe keys or issue refunds to simulate cancellation.

All old identities/events remain available for reconciliation. An authenticated late
success can still settle its original order. A late failure does not revive a
superseded order, while actual processing remains visible to block further starts.
Authentication, amount/identity checks and webhook event deduplication are preserved.

## Database and deployment

The new `checkout_start_requests` table is additive and initialized after the existing
membership schema. No data-clearing SQL is run during deployment. Per-account locking,
row locks and a unique `(user_id, request_id)` key serialize fresh starts; rollback
restores the prior active transaction if local creation fails. No new environment
variables are required.

## Verification

`tests/fresh-checkout.test.mjs` covers fresh identities, exact-click replay, account
isolation, plan snapshots, processing/Premium guards, rollback and history retention
using a transaction-aware in-memory ledger. It does not substitute for PostgreSQL
concurrency testing. `tests/fresh-checkout-http.test.mjs` exercises the real API route
with mocked dependencies, validation, UI wiring and late webhook behavior. Existing
checkout/relay regression tests and Next.js/Docker smoke checks remain in CI.

No live AMS/Stripe payment, refund, production database mutation or deployment is
performed by these tests.
