# PromptPay QR implementation

The MCDA billing flow uses **standard Thai PromptPay Tag 29 EMVCo payloads**. The receiver can be configured with either a Thai mobile number or a 13-digit National ID / Tax ID.

## Environment configuration

Direct PromptPay + EasySlip price:

```env
MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP=59.00
# Optional common fallback when the channel-specific value is unset/blank:
MCDA_PREMIUM_WEEKLY_PRICE_THB=59.00
```

The EasySlip override takes precedence over the common fallback, then the application defaults to `59.00` THB. The value must be positive and may contain up to 2 decimal places, for example `1.00`, `49`, `59.00`, or `79.50`.

`MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE` separately configures card **and PromptPay inside Stripe Hosted Checkout**. A PromptPay payment inside Stripe does not use the EasySlip price. See the README payment configuration section for both channel settings and Easypanel deployment instructions.

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

These values are server-side only. The application returns only a masked receiver identifier to the browser.

Backward-compatible fallbacks are also supported:

```env
MCDA_PROMPTPAY_PHONE=
MCDA_PROMPTPAY_NATIONAL_ID=
```

## PromptPay Tag 29 mapping

- PromptPay AID: `A000000677010111`
- Mobile number: sub-tag `01`, normalized to `00` + country-code form (`66xxxxxxxxx`)
- National ID / Tax ID: sub-tag `02`, 13 digits
- Amount: field `54` as decimal THB from the stored payment order amount
- Currency: `764` (THB)
- Order reference: Additional Data Field Template `62`, sub-tag `05` (Reference Label)
- CRC: CRC16-CCITT over the complete payload through `6304`
- The raw payload is passed directly to the `qrcode` encoder with a quiet zone; no pipe prefix, carriage returns, URL encoding, or merchant-specific wrapper is added.

For every direct-QR payment order, `external_reference` (for example `MCDA...`) is embedded in the QR as `62.05` immediately before field `63`. CRC is recalculated after the reference is added. Stripe orders are not offered a direct bank-transfer QR.

Example structure:

```text
... + 54 <length> <ORDER_AMOUNT> + 62 <length> 05 <length> <ORDER_REFERENCE> + 6304 + <CRC16>
```

The effective EasySlip price is the source of truth when creating a new direct-QR order. After changing the environment and restarting/redeploying, the next direct-QR creation retires non-expired, unpaid `awaiting_payment` orders tagged `promptpay_slip` whose amount differs. It then reuses a matching direct-QR order or creates a new order, reference, and QR at the current EasySlip price. Stripe-priced orders and legacy untagged orders are not reused or retired by this price check. Paid, processing, and uncertain history is not repriced.

Once a payment order is created, its stored amount remains the source of truth for that order's QR and AMS `expected_amount`. Changing configuration does not rewrite existing order amounts. Legacy untagged records remain in payment history for reconciliation; never pay again just because a new QR is offered.

The implementation keeps the existing AMS client-guide point-of-initiation behavior and changes the PromptPay proxy sub-tag/value according to the configured receiver type.

## Payment verification

Standard PromptPay Tag 29 QR does not use the merchant-specific `ref1/ref2` contract. The order reference is carried in `62.05`, while payment acceptance remains server-side and uses:

- the selected payment order / `external_reference`
- expected amount from the stored order and currency
- AMS verification status
- provider duplicate status
- provider transaction reference uniqueness

The verifier does not currently require the payment provider to echo field `62.05`, because the current AMS client contract does not guarantee a normalized field for that value. The server still sends the stored `external_reference` to AMS and validates the selected order independently.

Do not commit the real PromptPay phone number or National ID / Tax ID. Configure the value through Easypanel/secret environment variables.
