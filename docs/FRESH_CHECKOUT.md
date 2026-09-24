# Fresh transaction for Card / PromptPay

## User behavior

Each deliberate click on either Hosted Checkout button in `/billing` sends
`POST /api/billing/orders` with `{ "freshCheckout": true, "requestId": "<uuid-v4>" }`.
The authenticated account, current PostgreSQL plan price and duration are authoritative;
the client cannot submit amount, user ID, external reference or callback URL.

The server atomically marks that account's previous unpaid `awaiting_payment` orders
for this plan `superseded`, creates a new Order UUID, external reference and payment
reference, and records the click in `checkout_start_requests`. Existing processing,
requires-action, pending, manual-review, unknown, paid, refunded, failed and expired
records are NOT deleted, reset, refunded or reused. Other accounts/plans are not
modified. The Direct PromptPay/slip flow's empty POST is unchanged.

The browser then opens `/api/billing/orders/<NEW_ORDER_ID>/checkout`, which uses the
existing AMS Hosted Checkout adapter, authenticated per-order relay callback and
server-generated success/cancel URLs. A fresh local order has no old AMS payment ID
or Checkout Session ID. Its normal per-order deterministic idempotency key is new.
A valid successful AMS response redirects to the returned `checkout_url`; null URLs,
provider errors and failed sessions are still reported rather than fabricated.
No Stripe keys are added to MCDA and there are no direct Stripe API calls.

## New click versus retry

A different intentional click gets a different UUID and order. Repeating the same
POST payload with the same `requestId` for the same account returns the original
active order without clearing again, even after an admin changes plan pricing.
An already superseded, expired or paid click cannot be resurrected. The browser
blocks overlapping clicks and does not automatically retry either POST.

Previous transactions never veto a new deliberate click. In particular, old
`processing`, `requires_action`, `pending`, `manual_review` and `payment_unknown`
records, whether locally expired or not, no longer produce
`PAYMENT_CONFIRMATION_PENDING`. An existing Premium subscription also does not
veto this creation API. It remains unchanged, and this patch does not add a renewal
button, extend subscriptions, grant access, cancel payments or issue refunds.
Authentication, request validation and an active plan are still required.

This removes the stale-payment gate, not evidence of payment: starting a new order
never proves an older payment failed or that no money moved. Use only the newest
payment link and do not pay again if a previous attempt already deducted money.

## Important: local retirement is not remote cancellation

This change clears the selected local transaction and prevents its normal local
reuse. It does NOT expire an already issued Stripe Checkout URL or remove an AMS
record. No remote expiration operation is invoked. An old Stripe link may remain
payable, including one associated with a preserved processing or unknown payment.
Automatic remote cancellation would require a separately verified service-scoped
AMS operation; do not simulate it by deleting local records or changing Stripe keys.

All old identities/events remain available for reconciliation. An authenticated late
success can still settle its original order. A late failure does not revive a
superseded order. Actual processing remains visible in the ledger but no longer
blocks new starts. Authentication, amount/identity checks and webhook event
deduplication are preserved. Different real payments remain different transactions;
this change does not automatically refund or merge them.

## Database and deployment

The existing `checkout_start_requests` table continues to provide per-click replay
protection. No new schema or environment variable is required by this correction.
No data-clearing SQL is run during deployment. Per-account locking, row locks on
only the awaiting/unpaid predecessors, and a unique `(user_id, request_id)` key
serialize fresh starts. A rollback restores the prior awaiting transaction if local
creation fails. Paid or uncertain histories are not locked for a global veto.

## Verification

`tests/fresh-checkout.test.mjs` covers fresh identities, exact-click replay, account
isolation, plan snapshots, old processing/pending/manual-review/unknown states with
past and future expiry, mixed historical records, existing Premium, rollback and
history retention using a transaction-aware in-memory ledger. It does not substitute
for PostgreSQL concurrency testing. `tests/fresh-checkout-http.test.mjs` exercises
the real API route with mocked dependencies, validation, UI redirect wiring and late
webhook behavior. Existing checkout/relay regressions and Next.js/Docker smoke checks
remain in CI.

No live AMS/Stripe payment, refund, production database mutation or deployment is
performed by these tests.
