# BitCaptcha

Drop-in widget that gates access behind small Lightning payments. No server, no central service, no identity required.

## Quick Start

Add two lines to your HTML:

```html
<script src="https://deekay.github.io/bitcaptcha/widget.js"></script>
<div id="bitcaptcha"
     data-wallet="YOUR_WALLET_CONNECTION_STRING"
     data-amount="100"
     data-callback="onVerified">
</div>
```

That's it. The widget handles invoice generation, payment UX, and verification.

## How It Works

1. User clicks "Verify with Bitcoin"
2. Widget creates a Lightning invoice via your wallet
3. User pays via WebLN one-click or QR code scan
4. Widget verifies payment cryptographically
5. Your callback fires with a verification token

No backend needed. Your wallet handles everything.

## Setup

### 1. Get a Wallet Connection String

You need a Lightning wallet that can generate invoices. Create a **receive-only** connection in your wallet and copy the connection string.

**Recommended wallets:**
- [Alby Hub](https://albyhub.com) — self-hosted, available now, 0% fee
- [Lexe](https://lexe.app) — always-online, 0.5% fee (closed beta)

In your wallet, create a new app connection with **receive-only** permissions (`make_invoice` + `lookup_invoice`). Copy the connection string it gives you.

### 2. Configure the Widget

```html
<div id="bitcaptcha"
     data-wallet="YOUR_WALLET_CONNECTION_STRING"
     data-amount="100"
     data-description="Verify to continue"
     data-theme="auto"
     data-callback="onVerified"
     data-button-text="Verify with Bitcoin"
     data-size="normal">
</div>
```

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `data-wallet` | Yes | — | Wallet connection string |
| `data-amount` | No | `100` | Sats required |
| `data-description` | No | `"Verification payment"` | Invoice description |
| `data-callback` | No | — | Global function name called on success |
| `data-theme` | No | `"auto"` | `"light"`, `"dark"`, or `"auto"` |
| `data-button-text` | No | `"Verify with Bitcoin"` | Button label |
| `data-size` | No | `"normal"` | `"normal"` or `"compact"` |

### 3. Handle Verification

```html
<script>
function onVerified(token) {
  console.log('Payment verified!', token);
  // token = { paymentHash, preimage, settledAt }

  // Option A: Submit with form
  document.getElementById('bitcaptcha-token').value = JSON.stringify(token);
  document.getElementById('signup-form').submit();

  // Option B: Use in API call
  fetch('/api/signup', {
    method: 'POST',
    headers: {
      'X-BitCaptcha-Preimage': token.preimage,
      'X-BitCaptcha-Invoice': token.paymentHash,
    },
    body: formData,
  });
}
</script>
```

## Payment Flow

```
User clicks button
  → Widget connects to your wallet
    → Wallet creates Lightning invoice
      → WebLN detected? → One-click payment prompt
      → No WebLN? → QR code + copy invoice
        → Widget checks for payment
          → Payment settled → Cryptographic verification
            → Callback fires with verification token
```

## Security

- The wallet connection string is **receive-only** — it cannot spend your funds
- Worst case from exposing the string is invoice spam (mitigable with wallet-side rate limits)
- Payment verification uses SHA256 preimage check — cryptographically sound
- Widget renders in a closed Shadow DOM — styles can't leak in or out
- All crypto uses [audited noble libraries](https://paulmillr.com/noble/)

## Development

```bash
npm install
npm test          # Run all tests
npm run build     # Build dist/widget.js
npm run dev       # Watch mode with sourcemaps
npm run size      # Check gzipped bundle size
```

### Local Demo

```bash
npm run build
npx serve demo
```

Then open the local URL and update the `data-wallet` attributes in `demo/index.html` with your wallet connection string.

## Architecture

- **TypeScript** with esbuild IIFE bundle
- **Shadow DOM** (closed) for CSS isolation
- **WebLN first** → QR code fallback → copy invoice
- **Payment state machine** with enforced transitions
- **~31kb gzipped** (includes full secp256k1 + ChaCha20 + QR generator)

## License

MIT
