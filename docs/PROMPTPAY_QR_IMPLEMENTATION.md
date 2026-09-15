# PromptPay QR implementation

The MCDA billing flow uses the **standard Thai PromptPay mobile-number EMVCo payload** described in the AMS Gateway client integration guide.

- Receiver is configured server-side with `MCDA_PROMPTPAY_PHONE` (10-digit Thai mobile number).
- Amount is encoded in field `54` as decimal THB, e.g. `59.00`.
- Merchant account information uses PromptPay AID `A000000677010111` and the normalized phone `66xxxxxxxxx`.
- CRC is CRC16-CCITT over the payload through `6304`.
- The raw payload is passed directly to the `qrcode` encoder; no pipe prefix, carriage returns, URL encoding, or merchant-specific wrapper is added.
- `ref1/ref2` are not embedded in standard mobile PromptPay QR. The order is matched server-side by the selected order, expected amount/currency, provider reference uniqueness, and AMS verification result.

The implementation intentionally follows the guide's asserted example payload using point-of-initiation value `11`, so the 1.00 THB example for `0836777796` reproduces:

```text
00020101021129370016A000000677010111011300668367777965802TH54041.00530376463047C30
```

Do not commit the real receiver phone number. Configure it in Easypanel/secret environment variables.
