# AMS Gateway Integration Guide

คู่มือนี้อธิบายวิธีเชื่อม Client Application เข้ากับ **AMS Payment Gateway** โดยใช้ MCDA เป็น reference implementation ที่ใช้งานจริงใน repository นี้

> เป้าหมายหลักคือให้ developer คนใหม่เปิดเอกสารนี้แล้วเข้าใจได้ว่า Client ต้องทำอะไร, AMS ทำอะไร, Stripe อยู่ตรงไหน, ต้องส่ง request แบบไหน, รับ webhook อย่างไร และจุดไหนห้ามใช้เป็นหลักฐานว่าชำระเงินสำเร็จ

---

## 1. Architecture ที่ใช้

MCDA ไม่เชื่อม Stripe โดยตรง

```text
Client / MCDA
    |
    | X-AMS-API-Key
    v
AMS Payment Gateway
    |
    | Stripe credentials อยู่ที่ AMS
    v
Stripe Hosted Checkout
    |
    | ผู้ใช้ชำระ Card / PromptPay
    v
Stripe
    |
    | Stripe webhook
    v
AMS Payment Gateway
    |
    | AMS relay webhook
    v
Client / MCDA
```

หลักสำคัญ:

- Client ใช้ **AMS API key** เท่านั้น
- Client ไม่ต้องมี `STRIPE_SECRET_KEY`
- Client ไม่ต้องมี `STRIPE_PUBLISHABLE_KEY`
- Client ไม่ต้องมี `STRIPE_WEBHOOK_SECRET`
- AMS เป็นผู้สร้าง Stripe Checkout Session
- Client redirect ผู้ใช้ไปยัง `checkout_url` ที่ AMS คืนมา
- Client เปิดสิทธิ์/mark paid เฉพาะหลังได้รับ webhook ที่ตรวจสอบแล้วจาก AMS
- การกลับมาที่ `success_url` ไม่ใช่หลักฐานว่าชำระเงินสำเร็จ

---

## 2. สิ่งที่ Client ต้องได้รับจาก AMS Platform Team

ก่อนเริ่ม integration ต้องมีอย่างน้อย:

1. `service_code`
2. Service API key เช่น `ams_...`
3. Scopes ที่เปิดให้ใช้งาน
4. Source IP policy / allowlist
5. Webhook host policy ถ้า service จำกัด allowed hosts
6. Stripe provider ถูกเปิดให้ service

Scopes ที่เกี่ยวข้องกับ payment:

| Scope | ใช้สำหรับ |
|---|---|
| `payments:create` | สร้าง Hosted Checkout / PaymentIntent |
| `payments:refund` | refund |
| `slips:verify` | ตรวจสลิปผ่าน EasySlip |
| `reports:read` | อ่าน report ตามสิทธิ์ |

---

## 3. Environment Variables ฝั่ง Client

ตัวอย่างของ MCDA:

```env
AMS_GATEWAY_BASE_URL=https://ams-gateway.micro-support.com
AMS_GATEWAY_API_KEY=ams_...
AMS_SERVICE_CODE=mcda
AMS_STRIPE_PAYMENT_METHODS=card,promptpay

# URL public ของ client
NEXT_PUBLIC_APP_URL=https://mcda-decision-analysis.micro-support.com

# MCDA ใช้ secret นี้สร้าง per-order callback capability
AUTH_SECRET=<long-random-secret>
```

ข้อควรระวัง:

- `AMS_GATEWAY_API_KEY` เป็น server-side secret
- ห้ามใส่ API key ลง `NEXT_PUBLIC_*`
- ห้ามส่ง API key ไป browser/mobile app
- อย่าเพิ่ม Stripe keys เข้า Client ถ้าใช้ AMS Hosted Checkout

---

## 4. Smoke Test ก่อนเริ่ม Payment

ทดสอบว่า API key และ service เปิดใช้งานจริง:

```http
GET https://ams-gateway.micro-support.com/api/v1/service
X-AMS-API-Key: ams_...
X-Request-Id: smoke-001
Accept: application/json
```

ตัวอย่าง response:

```json
{
  "data": {
    "service_id": "service-uuid",
    "service_code": "mcda",
    "enabled_providers": ["easyslip", "stripe"],
    "providers": {
      "easyslip": true,
      "stripe": true
    }
  }
}
```

Client ควรตรวจอย่างน้อย:

```text
service_code ตรงกับ service ของตัวเอง
providers.stripe === true
```

ถ้าได้:

- `401` → ตรวจ API key / key status
- `403 CLIENT_IP_NOT_ALLOWED` → ตรวจ public egress IP
- `403 SCOPE_NOT_ALLOWED` → ตรวจ scope/provider ของ service

---

## 5. Client ต้องสร้าง Order ของตัวเองก่อน

AMS ไม่ควรเป็น source of truth ของ order ธุรกิจ

Client ควรสร้าง local order ก่อน เช่น:

```text
payment_orders
- id
- user_id
- external_reference
- amount
- currency
- status
- plan_code
- plan_duration_days
- ams_payment_id
- stripe_checkout_session_id
- stripe_payment_intent_id
- paid_at
```

ข้อมูลที่สำคัญต้องมาจาก server:

- amount
- currency
- package/plan
- duration
- external reference

อย่าให้ browser เป็นผู้ส่งยอดเงินที่ server เชื่อโดยตรง

ตัวอย่าง MCDA:

```text
external_reference = MCDAA1B2C3D4E5F678
amount             = 59.00
currency           = THB
plan               = mcda_weekly_unlimited
duration           = 7 days
```

---

## 6. Policy ของ MCDA: กด Card / PromptPay แล้วสร้าง Order ใหม่

MCDA ใช้ policy แบบ **fresh transaction per deliberate click**

เมื่อผู้ใช้กด:

```text
ไปหน้าชำระเงิน Card / PromptPay
```

browser ส่ง:

```http
POST /api/billing/orders
Content-Type: application/json

{
  "freshCheckout": true,
  "requestId": "<uuid-v4>"
}
```

Server จะ:

1. validate ผู้ใช้
2. lock account เพื่อกันการสร้างซ้ำพร้อมกัน
3. reuse order เดิมเฉพาะกรณีเป็น network retry ของ `requestId` เดิม
4. mark local order เก่าที่เป็น `awaiting_payment` และยังไม่ paid เป็น `superseded`
5. สร้าง Order ID ใหม่
6. สร้าง `external_reference` ใหม่
7. snapshot ราคาและจำนวนวันจาก PostgreSQL
8. ไม่ลบประวัติ payment เก่า
9. ไม่แก้สถานะ payment เก่าที่เป็น processing/pending/manual review
10. ไปสร้าง AMS Hosted Checkout ของ Order ใหม่

> การ supersede เป็นเพียง local MCDA policy ไม่ได้แปลว่า Stripe Checkout URL เก่าถูกยกเลิกจาก Stripe

---

## 7. Create AMS Hosted Checkout

Endpoint:

```text
POST https://ams-gateway.micro-support.com/api/v1/payments/stripe/checkout-sessions
```

Headers:

```http
X-AMS-API-Key: ams_...
X-Request-Id: <new-request-id>
Idempotency-Key: <stable-operation-key>
Content-Type: application/json
Accept: application/json
```

ตัวอย่าง payload:

```json
{
  "amount": "59.00",
  "currency": "THB",
  "payment_method_types": ["card", "promptpay"],
  "external_reference": "MCDAA1B2C3D4E5F678",
  "description": "MCDA Premium MCDAA1B2C3D4E5F678",
  "success_url": "https://mcda-decision-analysis.micro-support.com/billing?checkout=success&order_id=MCDAA1B2C3D4E5F678",
  "cancel_url": "https://mcda-decision-analysis.micro-support.com/billing?checkout=cancel&order_id=MCDAA1B2C3D4E5F678",
  "webhook_url": "https://mcda-decision-analysis.micro-support.com/api/webhooks/ams?order_id=MCDAA1B2C3D4E5F678&token=<per-order-capability>"
}
```

### success_url / cancel_url

MCDA ใช้ `order_id` ที่ตรงกับ `external_reference`

ไม่จำเป็นต้องใช้ `{CHECKOUT_SESSION_ID}`

ตัวอย่าง:

```text
success:
https://mcda-decision-analysis.micro-support.com/billing?checkout=success&order_id=MCDAA1B2C3D4E5F678

cancel:
https://mcda-decision-analysis.micro-support.com/billing?checkout=cancel&order_id=MCDAA1B2C3D4E5F678
```

### webhook_url

AMS รองรับ `webhook_url` ต่อ transaction

MCDA ไม่ใช้ webhook URL เปล่า แต่สร้าง **per-order callback capability**:

```text
/api/webhooks/ams
  ?order_id=<external_reference>
  &token=<HMAC-derived-token>
```

นี่เป็น hardening เฉพาะ MCDA ไม่ใช่ requirement พื้นฐานของ AMS contract

---

## 8. Idempotency

AMS mutation ต้องใช้ `Idempotency-Key`

กฎ:

- retry request เดิม → ใช้ key เดิม
- payload เปลี่ยน → operation/key ต้องเปลี่ยน
- ห้ามสุ่ม key ใหม่ทุกครั้งที่ timeout เพราะ request เดิมอาจถึง AMS/Stripe แล้ว
- ห้าม reuse key เดิมกับ payload ใหม่

MCDA สร้าง deterministic key จาก Order + fingerprint ของ payload:

```text
<order-id>-stripe-checkout-<payload-fingerprint>
```

fingerprint ครอบคลุม:

- amount
- currency
- external_reference
- description
- payment methods
- success_url
- cancel_url
- webhook_url

ดังนั้น:

```text
same order + same payload + retry
=> same Idempotency-Key

new order
=> new Idempotency-Key

changed callback/payload
=> new fingerprint
```

---

## 9. Response จาก AMS และการ Redirect

ตัวอย่าง response ที่ใช้งานได้:

```json
{
  "data": {
    "payment_id": "payment-verification-uuid",
    "status": "pending",
    "provider": "stripe",
    "checkout_session_id": "cs_live_...",
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_...",
    "payment_intent_id": null,
    "external_reference": "MCDAA1B2C3D4E5F678"
  },
  "meta": {
    "request_id": "request-id"
  }
}
```

Client ต้อง validate ก่อน redirect:

- HTTP response เป็น JSON
- ไม่มี `error`
- `provider === "stripe"`
- `external_reference` ตรงกับ Order
- `status === "pending"`
- `checkout_session_id` ถูกต้อง
- `checkout_url` เป็น HTTPS
- hostname ต้องเป็น `checkout.stripe.com`

เมื่อผ่านทั้งหมด:

```js
window.location.assign(checkoutUrl)
```

### สำคัญ: HTTP 200 ไม่ได้แปลว่า Checkout ใช้งานได้

ตัวอย่าง:

```json
{
  "data": {
    "status": "failed",
    "checkout_url": null
  }
}
```

แม้ HTTP status เป็น 200 ก็ **ห้าม redirect**

MCDA แยก business status ออกจาก transport status และคืน error ที่ควบคุมได้แทน

---

## 10. Browser กลับจาก Stripe

หลังลูกค้าชำระ Stripe อาจ redirect กลับ:

```text
/billing?checkout=success&order_id=...
```

หรือ:

```text
/billing?checkout=cancel&order_id=...
```

กฎสำคัญ:

```text
success_url != payment proof
```

Client ห้าม:

- mark paid จาก query string
- เปิด Premium จากหน้า success
- เชื่อว่าการ redirect กลับคือเงินเข้าแล้ว

หน้า success มีหน้าที่เพียง:

1. แจ้งผู้ใช้ว่ากลับมาจาก Checkout แล้ว
2. refresh/poll local order state ชั่วคราวได้
3. รอ AMS webhook เป็น authoritative result

---

## 11. Webhook Flow

Flow:

```text
Stripe
  |
  | POST Stripe event
  v
AMS /api/webhooks/stripe
  |
  | verify Stripe-Signature
  | deduplicate event
  | reconcile AMS payment
  v
AMS Relay
  |
  | POST webhook_url
  v
Client /api/webhooks/ams
```

AMS relay ส่ง headers:

```http
X-AMS-Webhook-Event: payment_intent.succeeded
X-AMS-Webhook-Delivery-Id: delivery-uuid
X-AMS-Webhook-Provider: stripe
Content-Type: application/json
```

body คือ Stripe event JSON ที่ AMS รับและ verify แล้ว

---

## 12. Authentication ของ Webhook ใน MCDA

AMS base contract ระบุ event/delivery/provider headers แต่ MCDA เพิ่ม protection อีกชั้นด้วย per-order callback URL

Checkout request ส่ง:

```text
webhook_url=
https://<mcda-domain>/api/webhooks/ams
?order_id=<external_reference>
&token=<HMAC-token>
```

Token derive จาก:

- `AUTH_SECRET`
- `AMS_SERVICE_CODE`
- `external_reference`

ฝั่ง webhook handler จะ:

1. validate path
2. validate `order_id`
3. validate token แบบ timing-safe
4. อ่าน JSON แบบมี size limit
5. validate AMS headers
6. validate Stripe event structure
7. validate metadata กับ Order
8. transaction-lock Order ใน PostgreSQL
9. deduplicate event/delivery
10. update Order/Subscription
11. commit
12. คืน HTTP 2xx

Middleware ยกเว้นเฉพาะ:

```text
/api/webhooks/ams
```

จาก end-user login redirect

แต่ authentication จริงทำใน route handler ด้วย callback capability

---

## 13. Events ที่ Client ต้องรองรับ

Hosted Checkout ควรรองรับอย่างน้อย:

### Success

```text
checkout.session.completed
checkout.session.async_payment_succeeded
payment_intent.succeeded
```

MCDA จะถือ `checkout.session.completed` เป็น paid เฉพาะเมื่อ:

```text
payment_status === "paid"
```

### Intermediate

```text
payment_intent.processing
payment_intent.requires_action
payment_intent.requires_payment_method
```

### Failure / End states

```text
payment_intent.payment_failed
payment_intent.canceled
checkout.session.async_payment_failed
checkout.session.expired
```

### Refund

AMS contract ยัง relay event กลุ่ม:

```text
refund.created
refund.updated
charge.refunded
```

หาก client รองรับ refund ต้อง update business state เฉพาะเมื่อ refund status ที่เชื่อถือได้เป็น `succeeded`

---

## 14. Validation ก่อน Mark Paid

อย่า mark paid เพราะ event type อย่างเดียว

MCDA ตรวจอย่างน้อย:

1. callback capability ถูกต้อง
2. provider header เป็น `stripe`
3. header event type ตรงกับ body event type
4. Stripe event ID มีรูปแบบถูกต้อง
5. delivery ID ถูกต้อง
6. event timestamp สมเหตุสมผล
7. metadata `ams_service_code` ตรงกับ service
8. `ams_external_reference` ตรงกับ local order
9. `ams_payment_verification_id` ตรงกับ `ams_payment_id`
10. Checkout Session ID ตรงกับที่บันทึก
11. PaymentIntent ID ตรงกับที่บันทึก เมื่อมี
12. test/live mode ตรงกัน
13. amount ตรงกับ Order
14. currency ตรงกับ Order
15. event ยังไม่เคยถูกประมวลผล
16. payment ยังไม่เคย settle ซ้ำ

จากนั้นจึง:

```text
payment_orders.status = paid
subscriptions = active
```

---

## 15. Idempotent Webhook Processing

Webhook อาจ:

- ส่งซ้ำ
- delivery ใหม่แต่ event เดิม
- event คนละชนิดของ payment เดียวกัน
- มาถึงต่างลำดับ

Client ต้อง deduplicate อย่างน้อย:

```text
Stripe event ID
AMS delivery ID
```

MCDA เก็บใน:

```text
payment_events
- event_id
- delivery_id
- order_id
- event_type
```

ถ้า event เคยรับแล้ว:

```json
{
  "received": true,
  "duplicate": true
}
```

และคืน 2xx โดยไม่ grant entitlement ซ้ำ

---

## 16. เมื่อ AMS ส่ง Webhook มา Client ต้องตอบอย่างไร

AMS relay ใช้ HTTP POST และมี retry

Client ควร:

- คืน `2xx` หลัง event ถูกประมวลผลสำเร็จ
- คืน `2xx` สำหรับ duplicate ที่จัดการแล้ว
- คืน `4xx` สำหรับ request ที่ invalid / authentication ไม่ผ่าน
- คืน `503` ถ้า event มาถึงก่อน local order persistence พร้อม เพื่อให้ AMS retry
- คืน `500` เมื่อ transaction/database processing ล้มเหลว

อย่าคืน `200` ให้ทุกอย่างเพียงเพื่อหยุด retry

---

## 17. Timeout / Non-JSON / Redirect Handling

Client adapter ควร:

- ส่ง `Accept: application/json`
- กำหนด timeout
- ไม่ follow redirect เมื่อ request มี AMS credentials
- ตรวจ `Content-Type` ก่อน parse JSON
- อย่าแสดง HTML upstream response ให้ user
- log request ID สำหรับ correlation
- อย่า log API key
- อย่า log full Checkout URL ถ้ามี token/query sensitive
- อย่า retry mutation ด้วย key ใหม่แบบอัตโนมัติ

ตัวอย่าง error ที่เคยพบ:

```text
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

แปลว่ามี HTML response ถูกส่งเข้า JSON parser

วิธีที่ถูก:

```text
check Content-Type
=> application/json / application/*+json เท่านั้น
=> ถ้าไม่ใช่ ให้ normalize เป็น AMS_NON_JSON_RESPONSE
```

---

## 18. Error ที่ควรแยกให้ออก

### 401 / 403

```text
UNAUTHENTICATED
CLIENT_IP_NOT_ALLOWED
SCOPE_NOT_ALLOWED
```

ตรวจ AMS key, scope และ egress IP

### 409

```text
IDEMPOTENCY_CONFLICT
```

เกิดเมื่อ key เดิมถูกใช้กับ payload ใหม่

อย่าแก้ด้วยการสุ่ม key ใหม่โดยไม่รู้ว่า request เดิมถึง provider หรือยัง

### 429

rate limited → backoff

### 502 / 504

provider unavailable / timeout

request อาจถึง AMS/Stripe แล้ว ดังนั้นต้อง reconcile ก่อนเริ่ม payment ใหม่ถ้า policy ของระบบไม่อนุญาต fresh payment

### HTTP 200 + data.status=failed

transport สำเร็จ แต่ business operation ไม่สำเร็จ

ห้าม redirect ถ้าไม่มี valid `checkout_url`

---

## 19. PromptPay + Slip Verification เป็นอีก Flow หนึ่ง

MCDA ยังมี fallback:

```text
Client สร้าง PromptPay QR
    ↓
User จ่าย
    ↓
User upload slip
    ↓
Client -> AMS /api/v1/slips/verify
    ↓
AMS -> EasySlip
    ↓
Client ตรวจ result + local order
    ↓
mark paid
```

Endpoint:

```text
POST /api/v1/slips/verify
```

Client ต้องส่ง expected values จาก Order:

```text
external_reference
expected_amount
expected_currency
image
```

การ verify slip ไม่ใช่ flow เดียวกับ Stripe Hosted Checkout

---

## 20. Security Checklist

### ต้องทำ

- [ ] API key อยู่ server-side
- [ ] amount/currency มาจาก Order ฝั่ง server
- [ ] ใช้ HTTPS
- [ ] ใช้ `X-Request-Id`
- [ ] ใช้ stable `Idempotency-Key`
- [ ] ตรวจ service/provider ก่อนสร้าง payment
- [ ] validate `checkout_url`
- [ ] webhook endpoint รับ POST
- [ ] webhook endpoint ไม่ redirect ไป login
- [ ] authenticate webhook ingress
- [ ] validate service/reference/payment/session/amount/currency
- [ ] deduplicate event
- [ ] update payment + entitlement ใน transaction
- [ ] คืน 2xx หลัง commit สำเร็จ
- [ ] เก็บ provider IDs เพื่อ reconciliation

### ห้ามทำ

- [ ] ห้ามใส่ Stripe secret ใน Client
- [ ] ห้าม mark paid จาก `success_url`
- [ ] ห้ามเชื่อ amount จาก browser
- [ ] ห้ามสร้าง Checkout URL เองจาก Session ID
- [ ] ห้าม parse HTML เป็น JSON
- [ ] ห้าม log AMS API key
- [ ] ห้าม grant entitlement ซ้ำจาก event ซ้ำ
- [ ] ห้าม reuse Idempotency-Key เดิมกับ payload ใหม่

---

## 21. Recommended Integration Sequence

สำหรับ service ใหม่ ให้ทำตามลำดับนี้:

```text
1. AMS team สร้าง service
2. รับ service_code + API key
3. ตั้ง scope/provider/IP/allowed webhook host
4. GET /api/v1/service
5. สร้าง local order model
6. ทำ AMS adapter
7. ทำ Hosted Checkout endpoint
8. ส่ง success_url/cancel_url/webhook_url
9. validate AMS response
10. redirect checkout_url
11. ทำ webhook endpoint
12. ทำ webhook authentication
13. validate event + local order
14. ทำ idempotent settlement transaction
15. ทดสอบ duplicate/out-of-order event
16. ทดสอบ timeout/non-JSON/failed-null response
17. ทดสอบ Docker/production routing
18. ทดสอบเงินจริงใน Stripe test mode
19. ตรวจ log/AMS reports
20. จึงเปิด production
```

---

## 22. Reference Implementation ใน Repository นี้

| Responsibility | File |
|---|---|
| AMS API adapter | `lib/ams-gateway.ts` |
| AMS relay authentication + event parser | `lib/ams-relay.ts` |
| Fresh local payment order | `lib/fresh-checkout-order.ts` |
| Create local order API | `app/api/billing/orders/route.ts` |
| Create AMS Hosted Checkout | `app/api/billing/orders/[id]/checkout/route.ts` |
| Receive AMS relay webhook | `app/api/webhooks/ams/route.ts` |
| Browser payment UI | `app/billing/page.tsx` |
| Auth middleware | `middleware.ts` |
| Membership/payment schema | `lib/membership-schema.ts` |
| Checkout result validation | `lib/hosted-checkout-result.ts` |
| Checkout troubleshooting | `docs/CHECKOUT_TROUBLESHOOTING.md` |
| Fresh checkout policy | `docs/FRESH_CHECKOUT.md` |
| PromptPay fallback | `docs/PROMPTPAY_QR_IMPLEMENTATION.md` |

---

## 23. Minimal End-to-End Pseudocode

```ts
// 1. Client server creates local order
const order = await createOrderFromServerPrice();

// 2. Client server asks AMS to create Hosted Checkout
const checkout = await ams.createCheckout({
  amount: order.amount,
  currency: order.currency,
  external_reference: order.externalReference,
  success_url: successUrl(order),
  cancel_url: cancelUrl(order),
  webhook_url: webhookUrl(order),
});

// 3. Persist AMS identities
await save({
  amsPaymentId: checkout.payment_id,
  checkoutSessionId: checkout.checkout_session_id,
});

// 4. Browser redirect
redirect(checkout.checkout_url);

// 5. Later: AMS POSTs webhook
const event = authenticateAndValidateAmsRelay(request);

// 6. Match against local order
validateOrder(event, order);

// 7. Idempotent settlement
await transaction(async () => {
  if (eventAlreadyProcessed(event.id)) return;

  if (event.confirmedPaid) {
    markOrderPaid(order);
    activateEntitlement(order);
  }

  saveEvent(event);
});

// 8. Tell AMS delivery succeeded
return HTTP_200;
```

---

## 24. Operational Troubleshooting

เวลาเกิดปัญหา ให้เก็บ correlation IDs เหล่านี้:

```text
external_reference
local order ID
X-Request-Id
Idempotency-Key
AMS payment_id
Stripe checkout_session_id
Stripe payment_intent_id
Stripe event ID
AMS webhook delivery ID
```

ตัวอย่าง debug ที่ดี:

```text
order=MCDAXXXXX
request_id=...
ams_payment_id=...
checkout_session_id=...
status=pending
has_checkout_url=true
```

หลีกเลี่ยง:

```text
API key
full callback token
full checkout URL
customer banking data
raw slip image
```

---

## 25. Summary

AMS Gateway integration ที่ถูกต้องควรคิดเป็น 3 ส่วนแยกกัน:

```text
A. Create local business order
B. Ask AMS to create/verify payment
C. Wait for authenticated AMS result before changing business state
```

สำหรับ Stripe Hosted Checkout:

```text
Client -> AMS -> Stripe
Stripe -> AMS -> Client
```

Client ไม่ต้องรู้ Stripe credentials และไม่ควรพยายามสร้าง payment state จาก browser redirect

ถ้าจำหลักเดียวได้ ให้จำอันนี้:

> **AMS เป็น payment infrastructure layer แต่ Client Order Service ยังเป็น source of truth ของ order, entitlement และ business state ของตัวเอง**
