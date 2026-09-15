# PromptPay QR implementation

The MCDA billing flow uses **standard Thai PromptPay Tag 29 EMVCo payloads**. The receiver can be configured with either a Thai mobile number or a 13-digit National ID / Tax ID.

## Environment configuration

Preferred configuration:

```env
MCDA_PROMPTPAY_TYPE=phone
MCDA_PROMPTPAY_ID=0836777796
```

or:

```env
MCDA_PROMPTPAY_TYPE=national_id
MCDA_PROMPTPAY_ID=1234567890123
```

Both values are server-side only. The application returns only a masked receiver identifier to the browser.

Backward-compatible fallbacks are also supported:

```env
MCDA_PROMPTPAY_PHONE=
MCDA_PROMPTPAY_NATIONAL_ID=
```

## PromptPay Tag 29 mapping

- PromptPay AID: `A000000677010111`
- Mobile number: sub-tag `01`, normalized to `00` + country-code form (`66xxxxxxxxx`)
- National ID / Tax ID: sub-tag `02`, 13 digits
- Amount: field `54` as decimal THB, e.g. `59.00`
- Currency: `764` (THB)
- CRC: CRC16-CCITT over the payload through `6304`
- The raw payload is passed directly to the `qrcode` encoder with a quiet zone; no pipe prefix, carriage returns, URL encoding, or merchant-specific wrapper is added.

The implementation keeps the existing AMS client-guide point-of-initiation behavior and changes only the PromptPay proxy sub-tag/value according to the configured receiver type.

## Payment verification

Standard PromptPay Tag 29 QR does not embed `ref1/ref2`. Payment acceptance remains server-side and uses:

- the selected payment order
- expected amount and currency
- AMS verification status
- provider duplicate status
- provider transaction reference uniqueness

Do not commit the real PromptPay phone number or National ID / Tax ID. Configure the value through Easypanel/secret environment variables.
