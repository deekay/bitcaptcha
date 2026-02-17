# BitCaptcha

Drop-in widget that gates access behind small Lightning payments. No server, no central service, no identity required.

## Quick Start

Add two lines to your HTML:

```html
<script src="https://bitcaptcha.github.io/widget.js"></script>
<div id="bitcaptcha"
     data-wallet="nostr+walletconnect://YOUR_PUBKEY?relay=wss://relay.example.com&secret=YOUR_SECRET"
     data-amount="100"
     data-callback="onVerified">
</div>
```

That's it. The widget handles invoice generation, payment UX, and verification.

## How It Works

1. User clicks "Verify with Bitcoin"
2. Widget creates a Lightning invoice via your wallet (NWC)
3. User pays via WebLN one-click or QR code scan
4. Widget verifies payment (SHA256 preimage check)
5. Your callback fires with a verification token

No backend needed. Your wallet handles everything.

## Setup

### 1. Get an NWC Connection String

You need a Lightning wallet that supports [NWC (Nostr Wallet Connect)](https://nips.nostr.com/47). Create a **receive-only** connection with `make_invoice` + `lookup_invoice` permissions.

**Recommended wallets:**
- [Alby Hub](https://albyhub.com) — self-hosted, available now, 0% fee
- [Lexe](https://lexe.app) — always-online SGX enclaves, 0.5% fee (closed beta)

### 2. Configure the Widget

```html
<div id="bitcaptcha"
     data-wallet="nostr+walletconnect://..."
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
| `data-wallet` | Yes | — | NWC connection string |
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
  → Widget connects to Nostr relay (WebSocket)
    → Sends encrypted make_invoice request to your wallet
      → Wallet creates Lightning invoice
        → WebLN detected? → One-click payment prompt
        → No WebLN? → QR code + copy invoice
          → Widget polls lookup_invoice
            → Payment settled → SHA256(preimage) === payment_hash
              → Callback fires with verification token
```

## Security

- The NWC connection string is **receive-only** — it cannot spend your funds
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

### Demo

```bash
npm run build
npx serve demo
```

Open http://localhost:3000 and update the `data-wallet` attributes with your NWC connection string.

## Architecture

- **TypeScript** with esbuild IIFE bundle
- **NIP-44 v2** encryption (audited, test-vector verified)
- **Shadow DOM** (closed) for CSS isolation
- **WebLN first** → QR code fallback → copy invoice
- **Payment state machine** with enforced transitions
- **~31kb gzipped** (includes full secp256k1 + ChaCha20 + QR generator)

## License

MIT
