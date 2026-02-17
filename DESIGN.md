# BitCaptcha: Design Proposal

**Status:** Draft — seeking feedback\
**Date:** February 2026\
**Author:** David King

---

## Overview

BitCaptcha is a drop-in widget that website and service operators can use to gate or prioritize incoming requests using small Bitcoin Lightning Network payments. Any request that shows up with a few sats attached signals serious intent — whether it comes from a human or an AI agent.

This is not about proving you're human. It's about **economic signaling**. In a world where AI agents increasingly interact with web services on behalf of users, the distinction between "human" and "bot" becomes meaningless. What matters is: does this request carry enough economic weight to be worth serving?

A small Lightning payment (e.g., 10–100 sats / fractions of a penny) is trivial for any legitimate request but makes DoS attacks, spam floods, and resource abuse prohibitively expensive at scale.

The project aims to be:

- **Free and open source** — MIT licensed, hosted on GitHub Pages
- **Serverless** — no central BitCaptcha backend; the widget is pure client-side JavaScript
- **Wallet-agnostic** — site operators bring their own Lightning wallet; requesters pay with any Lightning wallet
- **Easy to integrate** — a script tag and a few lines of configuration
- **Agent-friendly** — works for both human users in browsers and programmatic agents via API

---

## Why Economic Gating?

Existing approaches to controlling access all have significant limitations, especially as AI agents become the primary consumers of web services:

| Approach | Problem |
|----------|---------|
| **CAPTCHAs** | Designed to filter humans from bots — irrelevant when legitimate agents need access too. Frustrating UX. Accessibility issues. |
| **API keys / accounts** | Identity-based — requires signup, email verification, KYC. Doesn't stop a valid account from flooding requests. |
| **Rate limiting** | Blunt instrument — penalizes legitimate burst traffic. Easily circumvented with distributed IPs. |
| **IP blocking** | Arms race. Proxies, VPNs, botnets make this unreliable. Blocks legitimate users behind shared IPs. |

**Economic gating is different.** It doesn't care who or what is making the request. It only asks: are you willing to attach a small economic stake to this request?

| | Economic gating (BitCaptcha) |
|---|---|
| **Works for agents** | AI agents can pay Lightning invoices programmatically — no puzzle-solving needed |
| **Scales the cost of abuse** | 10,000 spam requests at 100 sats each = ~$100. Legitimate use stays cheap. |
| **Operator gets paid** | Every gated request generates revenue, not just friction |
| **No central authority** | No Google, no Cloudflare, no API key provider — just math and Bitcoin |
| **Privacy-preserving** | Lightning payments require no identity. No cookies, no fingerprinting. |

---

## Actors

| Actor | Role | Wallet? |
|-------|------|---------|
| **Service operator** | Installs the widget or API gate, receives payments | Yes — must be able to receive Lightning payments |
| **Requester** | Human user in a browser, or an AI agent making API calls | Yes — must be able to send Lightning payments |
| **BitCaptcha** | Client-side JS (for browsers) or protocol spec (for agents) that orchestrates the flow | No wallet — just code |

---

## Architecture

### The Core Challenge

Invoice generation requires access to the site operator's Lightning wallet/node. Without a backend server, how does the widget create invoices?

### The Solution: NWC (Nostr Wallet Connect)

[NWC (NIP-47)](https://nips.nostr.com/47) is a protocol that lets applications remotely control a Lightning wallet through end-to-end encrypted messages relayed over Nostr relays. Critically, NWC supports **granular permissions** — a connection can be restricted to only `make_invoice` and `lookup_invoice`, with no ability to spend funds.

This means:

1. The site operator creates a **receive-only** NWC connection on their wallet
2. The connection string gets embedded in the widget configuration (client-side)
3. The widget generates invoices and checks payment status by talking to the operator's wallet through Nostr relays
4. **No central server needed** — the Nostr relay network is the transport layer

### Payment Flow

**Step 1 — Invoice creation:**
Requester initiates action → Widget (or agent) sends `make_invoice` request via Nostr relay → Operator's wallet creates a BOLT-11 invoice → Invoice returned

**Step 2 — Payment:**
For browsers: widget displays invoice via WebLN prompt or QR code. For agents: agent pays the invoice programmatically.

**Step 3 — Verification:**
Widget/agent sends `lookup_invoice` request via Nostr relay → Operator's wallet confirms invoice is settled → Verification token produced, request proceeds

### What the Site Operator Embeds

```html
<script src="https://bitcaptcha.github.io/widget.js"></script>
<div id="bitcaptcha"
     data-nwc="nostr+walletconnect://pubkey?relay=wss://relay.example.com&secret=abc..."
     data-amount="100"
     data-description="Access payment"
     data-callback="onVerified">
</div>
```

### Security of the Exposed NWC Connection String

The NWC connection string is visible in client-side code. This is acceptable because:

- **It can only receive, never spend.** The connection is restricted to `make_invoice` + `lookup_invoice` permissions. An attacker cannot drain funds.
- **Worst case is invoice spam.** An attacker could generate many invoices, but this is mitigable with wallet-side rate limits.
- **No worse than a Lightning Address.** Publishing a Lightning Address (e.g., `user@getalby.com`) is also a public receive endpoint — the same attack surface already exists.

---

## Verification Model

### The Anti-Replay Problem

The widget can verify payment client-side: `SHA256(preimage) === payment_hash`. But without a backend, a paid preimage could be replayed — pay once, reuse the proof.

### Solution: Two-Tier Verification (Same Model as reCAPTCHA)

**Tier 1 — Client-side (the widget):**
- Widget generates a unique invoice per challenge
- On payment, widget shows a checkmark and produces a **verification token** containing the invoice ID, preimage, and timestamp

**Tier 2 — Server-side (the site operator's existing backend):**
- The site operator's backend verifies the token before granting access
- Verification = calling NWC `lookup_invoice` to confirm the specific invoice was settled
- The operator's backend maintains a set of used invoice IDs to prevent reuse

```python
# Example: site operator's backend (Python/Flask)
@app.route('/signup', methods=['POST'])
def signup():
    token = request.form['bitcaptcha_token']
    if not bitcaptcha.verify(token):  # checks invoice was paid & not reused
        return 'Verification failed', 403
    # proceed with signup...
```

```python
# Example: API endpoint gated for agents
@app.route('/api/query', methods=['POST'])
def query():
    preimage = request.headers.get('X-BitCaptcha-Preimage')
    invoice_id = request.headers.get('X-BitCaptcha-Invoice')
    if not bitcaptcha.verify(preimage, invoice_id):
        return 'Payment required', 402
    # process the request...
```

This mirrors reCAPTCHA's model: the client-side widget (or agent-side protocol) handles payment, and the operator's backend makes a verification call. The difference is that verification happens against the operator's **own wallet** (via NWC), not a central service.

**For operators without a backend** (static sites, etc.): The client-side verification alone still provides meaningful protection. An attacker would need to pay for every attempt — replay just means paying again.

---

## Wallet Support

### For Site Operators (Receiving Payments)

Any wallet with NWC support works. The operator creates a receive-only NWC connection and pastes the connection string into their widget config.

| Wallet | NWC Support | Notes |
|--------|-------------|-------|
| **Alby Hub** | Yes | Self-hosted, mature NWC implementation |
| **Lexe** | Yes | Runs 24/7 in secure enclaves, excellent uptime. Currently in closed beta. |
| **Mutiny** | Yes | Browser-based wallet with NWC |
| **Any NWC-compatible wallet** | Yes | NWC is an open standard — growing ecosystem |

**Key requirement:** The operator's wallet must be online to respond to NWC `make_invoice` requests. Wallets that run 24/7 (like Lexe's enclave-based nodes or always-on Alby Hub instances) are ideal.

### For Requesters (Making Payments)

**Browser-based (human users):**
1. **WebLN (best UX)** — One-click payment via browser extension (Alby) or Bitcoin Connect. No QR code needed.
2. **Bitcoin Connect** — Enables WebLN in any browser without extensions by connecting to the user's wallet via NWC. The widget would embed this.
3. **QR code scan** — User scans a Lightning invoice QR code with any mobile wallet (Phoenix, Muun, Cash App, Strike, etc.).
4. **Copy invoice** — User copies the BOLT-11 invoice string and pastes into any wallet.

**Programmatic (AI agents / automated systems):**
- Agent receives BOLT-11 invoice from the BitCaptcha flow
- Agent pays via its own Lightning wallet (NWC, LND/CLN API, Lexe SDK, MDK, etc.)
- Agent submits the preimage as proof of payment alongside the original request
- No widget needed — just the protocol

---

## Relationship to MDK and Lexe

### Do Any of These Require the Operator to Run a Server?

**No.** None of the three approaches — NWC, Lexe, or MDK — require the BitCaptcha operator to run or maintain server infrastructure. In all cases, the Lightning node hosting is handled by someone else (the operator's wallet provider, Lexe's SGX enclaves, or MDK's ephemeral serverless nodes). Even the NWC approach relies on Nostr relays and a wallet node running somewhere — it's just not the operator's problem.

The real difference between the approaches is the **transport layer and integration surface**, not who runs a server:

| Approach | Operator-managed infra | Transport layer | How invoices are created | Fee |
|---|---|---|---|---|
| **NWC** | None | Nostr relays (WebSocket) | Browser → Nostr relay → operator's wallet | 0% |
| **Lexe Sidecar SDK** | None | HTTP to Lexe enclaves | App → Lexe SDK → Lexe SGX enclave | 0.5% |
| **Lexe via NWC** | None | Nostr relays (WebSocket) | Browser → Nostr relay → Lexe SGX enclave | 0.5% |
| **MDK402** | None | Vercel serverless function | Request → Vercel function → MDK ephemeral node | 2% |

### MDK (MoneyDevKit)

MDK is a payment platform by Nick Slaney (ex-Block/Bitkey engineer) that wraps Lightning into a Stripe-like developer experience. Built on LDK, it runs ephemeral serverless Lightning nodes — spun up per-checkout, torn down after payment. Self-custodial via mnemonic.

**Key products relevant to BitCaptcha:**

- **MDK402** — gates any API route behind a Lightning payment using HTTP 402. Server-side wrapper: `withPayment({ amount: 100, currency: 'SAT' }, handler)`. Supports dynamic pricing. This is essentially BitCaptcha's API gating use case, pre-built.
- **Agent Wallet** — a self-custodial Lightning wallet for AI agents, operated via CLI (`~/.mdk-wallet/`). Supports BOLT11, BOLT12, LNURL, and Lightning Addresses. Designed to integrate with MDK402 for autonomous agent payments.
- **Checkout SDK** — `@moneydevkit/nextjs` package with `<Checkout />` component and `useCheckout()` hook.

**Technical details:**
- npm packages: `@moneydevkit/nextjs`, `@moneydevkit/core`, `@moneydevkit/agent-wallet`
- Scaffolding: `npx @moneydevkit/create`
- Requires Next.js App Router + API route (`app/api/mdk/route.js`)
- Can deploy to Vercel with zero server management
- Docs: [docs.moneydevkit.com](https://docs.moneydevkit.com)
- GitHub: [github.com/moneydevkit](https://github.com/moneydevkit)
- Status: Public beta (early 2026)
- Pricing: 2% per transaction

**Fit with BitCaptcha:**

MDK402 overlaps significantly with BitCaptcha's API gating use case. The key differences:

| | BitCaptcha (NWC) | MDK402 |
|---|---|---|
| Operator-managed infra | None | None (Vercel serverless function) |
| Fee | 0% (direct to operator) | 2% per transaction |
| Setup complexity | Paste NWC string + script tag | npm install + API route + Vercel deploy |
| Wallet requirement | Any NWC wallet | MDK-managed ephemeral node |
| Browser widget | Yes (drop-in HTML) | No (React component, needs Next.js) |
| Agent protocol | HTTP 402 + preimage header | HTTP 402 + preimage header (same pattern) |
| Self-custodial | Operator's own wallet | Yes, via mnemonic |

**Strategic implication:** MDK402 already solves the server-side API gating case well. BitCaptcha's unique value is the **browser-side widget** for gating signups, forms, and page access — where no server exists and NWC is the only viable approach. Rather than competing with MDK on API gating, BitCaptcha could:

1. Focus on the pure front-end widget (NWC-based, no server)
2. Recommend MDK402 for operators who want server-side API gating
3. Ensure the agent-facing protocol (HTTP 402 + preimage) is compatible with MDK's Agent Wallet

### Lexe

Lexe is a self-custodial Lightning wallet that runs user nodes 24/7 inside Intel SGX secure enclaves. Built on LDK by the team at lexe.app.

**Architecture:**
- Each user's Lightning node runs in the cloud inside an SGX enclave — hardware-encrypted memory that even Lexe's own infrastructure can't read
- "Meganode" design: hundreds of user nodes share a single enclave process (non-sensitive components like routing tables are shared, keys and channel state are isolated) — achieves 10-100x memory efficiency, enabling free hosting
- Remote attestation verifies the enclave is running the expected code before secrets are provisioned
- All communication goes through TLS-in-TLS (TLS terminates inside the enclave)

**Two integration paths:**

1. **Sidecar SDK (server-side):** REST API at `localhost:5393`. Endpoints for `create_invoice`, `pay_invoice`, `payment` (status check), and `node_info`. Auth via credentials generated in the Lexe app. Available for Rust (first-class), Python (community wrapper), and any language via HTTP. Cannot run in a browser.

2. **NWC (browser-compatible):** Lexe fully implements NWC (NIP-47) with per-client keypairs and scoped permissions. Supported methods: `make_invoice`, `lookup_invoice`, `pay_invoice`, `multi_pay_invoice`, `pay_keysend`, `list_transactions`, `get_balance`, `get_info`. Relay: `wss://nostr.lexe.app`. This is the path a browser widget would use.

**Additional protocol support:** BOLT11, BOLT12 Offers, BIP 353 (human-readable payment IDs), Lightning Address (LNURL), on-chain Bitcoin (via BDK).

**Pricing:** Free node hosting (meganode efficiency makes this viable). 0.5% per payment.

**Status:** Closed beta. Developers using the Sidecar SDK get priority early access. Dev signup: [lexe.app/dev-signup](https://lexe.app/dev-signup).

**Fit with BitCaptcha:** Lexe is the ideal **recommended wallet** for site operators because:
- Always-online nodes (critical for responding to NWC `make_invoice` requests reliably)
- Self-custodial (operator holds their own keys in SGX)
- Full NWC support means it works with the primary architecture out of the box
- BOLT12 support opens a path to reusable offers (see Open Questions)
- Low fees (0.5% per payment) vs MDK's 2%
- Free hosting removes cost barriers for operators

**Limitation:** Still in closed beta. Alby Hub is the more immediately available option for operators.

### Recommended Architecture: Scope-Based Approach

Rather than choosing one integration path, BitCaptcha can offer the right tool for each context:

| Use case | Recommended approach | Operator-managed infra |
|---|---|---|
| **Browser widget** (signup forms, page gating, DDoS) | NWC via Nostr relay, operator uses Lexe or Alby Hub | None |
| **API gating** (server-side endpoints) | MDK402, or NWC verification in operator's backend | None (Vercel serverless function) |
| **Agent payments** (programmatic access) | HTTP 402 protocol, compatible with MDK Agent Wallet and any Lightning wallet | None |

The browser widget (NWC-based, no server) is BitCaptcha's unique contribution. API gating is largely solved by MDK402. The agent protocol should be designed for compatibility with both.

---

## Build Plan

### The MVP is one file: `widget.js`

The widget handles invoice generation, payment UX, and client-side verification. The operator's wallet (Lexe, Alby Hub, etc.) handles everything else — node hosting, channel management, invoice creation. No server, no verification library, no agent protocol. Just the widget.

### Operator Configuration

The widget is configured via `data-` attributes on the HTML element. Two modes:

**Bring your own wallet** — operator pastes their wallet connection string:

```html
<script src="https://bitcaptcha.github.io/widget.js"></script>
<div id="bitcaptcha"
     data-wallet="nostr+walletconnect://pubkey?relay=wss://relay.example.com&secret=abc..."
     data-amount="100"
     data-description="Verify to continue"
     data-theme="light"
     data-callback="onVerified">
</div>
```

**Out-of-the-box setup** — operator signs up for a recommended wallet (Lexe, Alby Hub) through BitCaptcha's docs, or BitCaptcha provides a default receive path for operators who just want to try it:

```html
<div id="bitcaptcha"
     data-amount="100"
     data-callback="onVerified">
</div>
```

(The zero-config path could use a BitCaptcha-hosted wallet as a default, with sats forwarded to the operator once they configure their own wallet. Details TBD.)

### Configuration Options

| Attribute | Required | Default | Description |
|---|---|---|---|
| `data-wallet` | No | BitCaptcha default (TBD) | Wallet connection string (NWC URI, or future Lexe/MDK endpoint) |
| `data-amount` | No | `100` | Sats required to pass the captcha |
| `data-description` | No | `"Verification payment"` | Description shown on the Lightning invoice |
| `data-callback` | No | None | JS function name called with verification token on success |
| `data-theme` | No | `"auto"` | `"light"`, `"dark"`, or `"auto"` (matches `prefers-color-scheme`) |
| `data-button-text` | No | `"Verify with Bitcoin"` | Custom button label |
| `data-size` | No | `"normal"` | `"compact"` or `"normal"` |

### What Gets Built

| Component | Description | Priority |
|---|---|---|
| **widget.js** | Core widget — wallet communication, payment UI (WebLN → QR → copy invoice), client-side preimage verification, callback with token | MVP |
| **Styling** | Light/dark themes, compact mode, CSS custom properties for operator overrides | MVP |
| **Docs site** | Setup guide, wallet recommendations (Lexe, Alby Hub), configuration reference | MVP |
| **npm package** | For operators using build tools / React / etc. | Fast follow |
| **Server-side verify lib** | Optional — for operators who already have a backend and want replay protection | Later |
| **Agent protocol spec** | HTTP 402 + preimage header documentation for programmatic access | Later |

### What We Don't Build

- Lightning node infrastructure (Lexe/Alby Hub/MDK handle this)
- Agent wallets (MDK Agent Wallet exists)
- API route gating (MDK402 exists)
- A backend of any kind

---

## Technical Stack

**widget.js:**

| Component | Technology |
|-----------|-----------|
| Widget | Vanilla JS or Preact (~3kb), hosted on GitHub Pages / CDN |
| Wallet communication | NWC client (lightweight implementation), with abstraction layer for future Lexe/MDK direct APIs |
| Payment UI | Bitcoin Connect (enables WebLN in all browsers without extensions) |
| QR codes | Lightweight QR library for mobile wallet fallback |
| Verification | Client-side SHA256 preimage check |
| Distribution | `<script>` tag from CDN / GitHub Pages + npm package |

The wallet communication layer should be abstracted so the widget isn't permanently coupled to NWC. If Lexe or MDK expose direct browser-callable APIs in the future, the widget can adopt those without changing the operator-facing configuration.

---

## Open Questions

### Wallet and Protocol

1. **What's the best out-of-the-box wallet recommendation for operators?** Lexe (closed beta, always-online, 0.5%) vs Alby Hub (available now, self-hosted, 0%) vs something else?

2. **Should BitCaptcha offer a zero-config default wallet** so operators can try it without setting up any wallet at all? If so, who holds the sats in the interim?

3. **Can NWC connections be rate-limited at the wallet level** to prevent invoice-generation spam from an exposed connection string?

4. **What happens when the operator's wallet is offline?** Should the widget show an error, retry, or degrade gracefully?

### Payment Economics

5. **What is the practical minimum Lightning payment amount?** At what point do routing fees make tiny payments uneconomical?

6. **What's the right default payment amount?** 100 sats (~$0.10) as a starting point? Should operators be able to adjust dynamically based on load?

### Future Protocol Options

7. **Will Lexe or MDK expose browser-callable APIs** that could replace NWC as the transport layer? Worth tracking.

8. **Does BOLT 12 simplify anything?** Reusable offers could avoid per-challenge invoice generation. Lexe already supports BOLT12.

---

## Use Cases

**Web signup / form submission gating:**
A site operator adds BitCaptcha to their signup page in under 5 minutes. Paste a wallet connection string, add a script tag, done. Spam signups become economically unviable.

**Priority queuing:**
A service under heavy load can prioritize requests that arrive with payment attached. Free tier still exists, but paid requests jump the queue. The operator can dynamically adjust the price based on load.

**DDoS mitigation:**
An endpoint under attack starts requiring payment. Legitimate traffic (human or agent) pays fractions of a penny and proceeds. Attack traffic either pays (funding the operator) or stops.

**API access for AI agents (via MDK402):**
For server-side API gating, recommend MDK402 rather than building a competing solution. BitCaptcha's agent protocol (HTTP 402 + preimage header) should be compatible with MDK's Agent Wallet.

## What Success Looks Like

A site operator gates access in under 5 minutes:

1. Add two lines to their HTML (script tag + config div)
2. Optionally configure their own wallet — or just use the default to try it out

Human users see a clean "Verify with Bitcoin" button. The operator receives sats. No Google. No Cloudflare. No central service. No identity required from anyone.

---

## Feedback Requested

- Does the simplified build plan (just widget.js) miss anything critical?
- What's the best out-of-the-box wallet experience for operators who don't already have a Lightning wallet?
- Is client-side verification (preimage check) sufficient for most use cases, or will operators demand server-side replay protection from day one?
- Would you use this? What would make you more likely to adopt it?
