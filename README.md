# Wholly Crypto Node.js SDK

**Merchant 4 upgrade:** read `data.invoice_id` from invoice creation/detail and `invoice_id` from list rows. It matches the callback `invoice_id`. The server no longer returns `public_id`; internal `id` is not a checkout ID. Update custom response readers before upgrading your merchant. For older merchants, keep SDK 1.x or explicitly handle their older response shape.

The official JavaScript and TypeScript client for your **self-hosted Wholly Crypto merchant API**. Create invoices, check payments, manage accepted assets and verify IPN/webhooks.

One package. **Node.js 22+**, CommonJS and ES modules, built-in TypeScript declarations, **no runtime dependencies**. MIT licensed. SDK **2.5.0** targets merchant API **v1**, tested against merchant **5.6.0**. SDK and merchant versions are independent.

## Install

### With npm

```bash
npm install whollycrypto
```

Use this SDK on your **server**, not in a browser or mobile app. API keys must never reach customer devices. Use a security-maintained Node.js release.

### Without npm (manual download)

1. [Download the prebuilt SDK 2.5.0](https://github.com/whollycrypto-com/whollycrypto-node-sdk/releases/download/v2.5.0/whollycrypto-2.5.0.tgz).
2. Extract the archive and rename its `package` folder to `whollycrypto-node-sdk`. Put it beside your application script.
3. Keep `package.json` and the complete `dist/` folder together. Import the local entrypoint:

**JavaScript ES modules** (`app.mjs`, or a project using `"type": "module"`):

```javascript
import {Client} from './whollycrypto-node-sdk/dist/index.mjs';

const client = new Client('https://api.your-domain.com', process.env.WHOLLY_API_TOKEN);
// Use the invoice/payment methods below, then client.close() on shutdown.
```

**CommonJS** (`app.cjs`):

```javascript
const {Client} = require('./whollycrypto-node-sdk/dist/index.js');

const client = new Client('https://api.your-domain.com', process.env.WHOLLY_API_TOKEN);
```

**TypeScript (ES modules)** uses the same local entrypoint and included declarations:

```typescript
import {Client, type InvoiceCreate} from './whollycrypto-node-sdk/dist/index.mjs';

const payload: InvoiceCreate = {amount: '10.00', currency: 'EUR'};
```

For CommonJS TypeScript, import from `./whollycrypto-node-sdk/dist/index.js` instead.

Adjust the relative path to match your script. Set `WHOLLY_API_TOKEN` on your server
using a credential from **Settings → API access**. Replace `'whollycrypto'` in the
other examples with the local entrypoint; all methods and signature helpers are identical.

No npm install, `node_modules/` or build step is needed to run JavaScript. Node.js
22+ is still required; TypeScript source uses your application's existing TypeScript tooling.
Choose the **prebuilt `.tgz` asset**, not GitHub's automatic **Source code** download:
the source archive contains TypeScript and needs development tools to build it.
For a manual update, download a newer prebuilt release and replace the SDK folder;
keep your application code and credentials outside it.

## Create an invoice

Configure **your installation's API domain**, not its console or checkout domain. Create a read/write credential in **Settings → API access** and grant access to the project.

Find the UUIDs at **Project → Stores → select store → Basic → API IDs**. Copy **Project API ID** and **Store API ID**, not the readable identifiers. The public API does not list or create projects/stores.

```javascript
import {Client} from 'whollycrypto';
// CommonJS: const {Client} = require('whollycrypto');

const client = new Client('https://api.your-domain.com', process.env.WHOLLY_API_TOKEN);

// Persist this key AND the exact payload with the order BEFORE the request.
// Reuse the key, credential and payload if a response is lost.
const idempotencyKey = 'order-1042-payment-attempt-1';

try {
  const result = await client.createInvoice(
    '11111111-1111-4111-8111-111111111111', // Your Project API ID
    '22222222-2222-4222-8222-222222222222', // Your Store API ID
    {
      amount: '49.90', // From a variable: amount: String(amount)
      currency: 'EUR',
      order_id: 'order-1042',
      email: 'customer@example.com',
      description: 'Annual plan',
      ipn_url: 'https://your-shop.com/wholly/ipn',
      redirect_url: 'https://your-shop.com/orders/1042',
      cancel_url: 'https://your-shop.com/cart',
    },
    idempotencyKey,
  );

  const publicInvoiceId = result.data.invoice_id;
  const checkoutURL = result.links.checkout;
  // Save publicInvoiceId with the order; return checkoutURL to your customer.
} finally {
  client.close();
}
```

These UUIDs are placeholders. A success/return URL is **not proof of payment**. Fulfil only after checking the authenticated invoice, matching the stored order, project/store and amount/currency, then committing fulfilment exactly once.

For a long-running application, reuse one client and close it during shutdown after outstanding requests finish. HTTPS connections are pooled; all network methods return promises. ESM and CommonJS share the same classes, so `instanceof APIError` works across both.

## Choose invoice payment methods

Merchant 5.3.0+ accepts chain-specific tickers for an invoice's payment methods:

```javascript
payload.payment_methods = [
  {chain_slug: 'ethereum', asset_tickers: ['USDC', 'USDT']},
  {chain_slug: 'bitcoin', payment_rail: 'lightning'},
];
```

Read the chain hint and asset ticker in **Project → Stores → Payment methods**, or read selected
entries from `await client.listStorePaymentAssets(projectId, storeId)`.
Tickers are trimmed and matched case-insensitively, within that chain and store.
If two accepted contracts share a ticker, the request fails even when one is not ready.
Use `asset_ids: [entry.asset.id]` to disambiguate (supported since merchant 5.1.0).
Never combine non-null `asset_ids` and `asset_tickers` in one selection.
Omit both to include all active accepted assets on that chain. Omit `payment_methods`
or use `null` for store defaults; `[]` is invalid. Lightning is separate.
On merchant **5.4.0+**, unknown, inactive, wrong-chain or unaccepted choices are
ignored. If none match, the invoice uses store defaults. Active selected methods
still need ready wallets/scanners and trustworthy rates; this never enables an asset.
Maximum 64 methods; store settings stay unchanged. Older merchants reject unmatched
choices. Keep the exact payload and idempotency key for retries.
`InvoicePaymentSelection` is exported for TypeScript users.
For failed creation, inspect `error.paymentMethodIssues` on an `APIError`
for the chain, ticker, `reason_code`, provider counts
and action. SDK 2.4.0+ includes safe scanner/wallet/rate guidance in `error.message`;
`error.details` and `error.apiMessage` remain explicit private diagnostics.
Keep these diagnostics private; do not log whole customer response bodies.
See [the selection schema and examples](https://www.whollycrypto.com/api/#create-invoice).

## TypeScript

Types ship in the package; no separate `@types/whollycrypto` installation is needed.

```typescript
import {Client, type InvoiceCreate, type InvoiceResult} from 'whollycrypto';

const payload: InvoiceCreate = {
  amount: '25.00', currency: 'USD', // Or: amount: String(amount)
  exchange_rate_spread_percent: '0.5',
  underpayment_tolerance_percent: '1',
  expires_in_seconds: 900,
  language: 'de',
  metadata: {
    firstname: 'Ada', lastname: 'Lovelace', street: '12 Example Street',
    street2: 'Suite 2', zip: '10115', city: 'Berlin', country: 'Germany',
    countryiso2: 'DE', company: 'Example GmbH', vatid: 'DE123456789',
  },
  checkout_appearance: {
    show_project_name: true,
    show_store_name: false,
    title: 'Complete your order', intro: 'Thanks for choosing us.',
    outro: 'Questions? https://your-shop.com/help',
    intro_font_size: 18, outro_font_size: 16,
    theme: 'light', accent_color: '#1768CE',
  },
};
// With your open client, IDs and previously persisted key:
// const result: InvoiceResult = await client.createInvoice(projectId, storeId, payload, key);
```

Omitted settings inherit store defaults. Omit optional object properties instead of setting them to `undefined`. Use `{}` for objects, not `[]`. An empty `checkout_appearance` freezes the resolved store design for that invoice; omitting it keeps normal store appearance behavior. Appearance uses structured fields, never arbitrary HTML, JavaScript or CSS. The server remains authoritative for validation and allowed methods.

Every method preserves the **full response envelope**, including `data`, `links`, `pagination` and reconciliation's separate top-level fields. Known fields have types; additional response fields remain accessible as `unknown`. Types describe the API contract, not complete runtime schema validation.

### Exact amounts

Merchant 5.6.0 adds these name-visibility controls. They affect the checkout header,
not identity fields in JSON. In **Store → Basic → Store domains**, choose preferred
checkout and API hosts. Links use this store, then its default store, then the
system primary; only active domains qualify. Set your SDK base URL to the preferred
API host. Already-signed callback retries keep their original links.

Amounts, spread, tolerance and fixed token prices require **plain decimal strings**. Numbers, `bigint`, exponent notation and custom decimal objects are rejected for these inputs. Convert your decimal-library value to an exact non-exponent string first, never through `Number`.

Monetary strings are unchanged. JSON integer literals within JavaScript's safe range become numbers. **Fractional/exponent literals and unsafe integer literals become exact strings**, rather than losing precision through `JSON.parse`. For example, JSON `0.1234567890123456789` becomes `'0.1234567890123456789'`. Do not convert monetary strings to floating point when reconciling payments.

Request object keys are sorted; list order and decimal spelling stay unchanged. `undefined`, custom serialization, accessors, sparse arrays, unsafe integers and non-finite values are rejected. Idempotency is bound to the credential and **exact raw JSON bytes**: do not change payloads or switch SDK/encoding during a retry. `Client.newIdempotencyKey()` generates a key but does not persist it for you.

## Read and paginate

```javascript
const invoice = (await client.getInvoice(projectId, publicInvoiceId)).data;
const page = await client.listInvoices(projectId, {
  store_id: storeId, status: 'settled', search: 'order-1042', limit: 50, offset: 0,
});

for await (const invoice of client.iterateInvoices(projectId, {status: 'settled'})) {
  // Each next page is loaded only when needed.
}
```

These snippets assume an open client. Invoice paths use `invoice_id`, not internal `id` or `order_id`. `processing` is not `settled`. Offset pages are separate snapshots: deduplicate by public invoice ID when exporting during incoming payments.

## API coverage

| Method | Purpose |
| --- | --- |
| `serviceInfo()` / `health()` | Public service/health; no token sent |
| `createInvoice(project, store, payload, key)` | Create or replay an invoice |
| `getInvoice(project, publicId)` | Private invoice detail and checkout link |
| `listInvoices(project, filters)` / `iterateInvoices(project, filters)` | Search and paginate |
| `listProjectPaymentAssets(project)` | Native/token policies and readiness |
| `updateProjectPaymentAsset(project, asset, policy)` | Update project asset policy |
| `listTokenCandidates(project, chain, filters)` | Catalog search with `q` and `limit` |
| `registerTokenAsset(project, token)` | Verify/register a catalog token |
| `discoverCustomDexPools(project, chain, contract)` | Discover supported DEX pricing candidates |
| `registerCustomToken(project, token)` | Verify/register a custom contract or mint |
| `listStorePaymentAssets(project, store)` | Accepted assets and separate Lightning readiness |
| `updateStorePaymentAssets(project, store, assets)` | **Replace** the entire on-chain selection |
| `updateStoreConfirmationPolicy(project, store, asset, policy)` | Inherit or override confirmations |
| `listProjectWallets(project)` | Public addresses and balances, no keys |
| `listReconciliation(project, filters)` | Needs-attention queue, 25 cases per page |
| `getReconciliation(project, publicId, page = 1)` | Detail and paginated decision history |

See [payment-method examples](https://github.com/whollycrypto-com/whollycrypto-node-sdk/blob/main/docs/payment-methods.md) and the [full public API reference](https://www.whollycrypto.com/api/).

`updateStorePaymentAssets()` takes the list itself, not an `assets` wrapper. `[]` removes **all on-chain selections**; it does not configure Lightning. Sending funds, refunds, reconciliation decisions, accounts, exchange credentials and Lightning configuration are console-only. The SDK does not invent public routes for them.

Keep amounts as decimal strings from the start. `String(amount)` converts a variable to the required string type, but cannot recover precision already lost through floating-point calculations. Keep the original decimal text; do not calculate payment totals with floats.

## Verify IPN and webhooks

IPN sends every generated invoice event to the store default URL or invoice's `ipn_url`. Webhooks send only selected events. Both deliver the same JSON snapshot. Use **Store → IPN's secret for IPN** and **the individual webhook endpoint's secret for webhooks**, never an API token. Rotating one does not rotate the others. Pass the **exact raw body bytes**, before JSON parsing.

**For event-based handling, trigger an order check on `event_type = invoice.settled` with `status = settled`. Verify the current invoice and fulfil once.** `status` is a state snapshot; `event_type` explains what happened. `payment.received` can already carry `settled` when first detected (for example, on Solana), or `processing` while confirmations are pending. Do not credit both.

The supplied receiver is **state-based**: it groups project + `invoice_id` + `sequence`. Its worker checks the saved/current state regardless of event type. Do not add an `invoice.settled`-only filter after grouping: `payment.received` may have arrived first with the same settled revision. An event-based inbox instead preserves distinct signed `event_id` values. Both approaches need separate invoice/order-level fulfil-once protection.

Invoice statuses are `new`, `processing`, `settled`, `expired`, `invalid`, `cancelled`. `amount_status = paid` includes tolerance, not confirmation finality. Use `resolution` and `requires_review` for your exception policy. Version 2 includes signed event identity, `payment_info`, chain/token transfers, customer data and metadata. `amount`/`currency` are the original invoice total, not crypto received. Fetch the current invoice before fulfilment.

[IPN/webhook setup and receiver example](examples/ipn-webhooks.md) · [Integration guide](https://www.whollycrypto.com/documentation/#delivery-history) · [Event table and full payload](https://www.whollycrypto.com/api/#notifications). Also available in your console at `/settings/api/docs/#notifications`.

```javascript
import {parseNotification, InvalidSignatureError} from 'whollycrypto';

const notice = parseNotification(rawBody, request.rawHeaders, signingSecret);
// notice.invoiceId: public invoice UUID; notice.sequence: exact decimal string
// Durably enqueue before returning 2xx; failed storage must not be acknowledged.
// Deduplicate by (configuredProjectId, notice.invoiceId, notice.sequence).
```

Catch `InvalidSignatureError` and return HTTP 400. Configuration errors should fail closed. Verification uses HMAC-SHA256, constant-time comparison and a five-minute past/future clock window; keep the server clock synchronized. `verifySignature()` is available for signature-only checks. `parseNotification()` also validates UUIDs, status and sequence, and returns a deeply readonly payload. Body size is limited to 256 KiB.

**Event/delivery ID headers are not signed.** Version 2 signs `event_id`, `event_type`, `project_id` and `store_id` inside the body. Legacy events keep their old format. Match receiver scope, re-fetch the authenticated invoice before fulfilment and handle orders exactly once. Different event types can share a revision: compare the original nine invoice-state fields, not the whole body, when deduplicating by invoice/sequence.

`payment_info` includes chain/token amounts, remaining funds, confirmations, locked quote/spread/tolerance, advisory market rates and bounded transfers. Use `client.listInvoicePayments(projectId, invoiceId, {limit: 25, offset: 0})` for complete current observations. Keep metadata and customer data private.

The [Express-compatible receiver example](https://github.com/whollycrypto-com/whollycrypto-node-sdk/blob/main/examples/webhook-handler.mjs) verifies before calling your durable queue, returns 503 if storage fails, and never starts a server or fulfils an order. Mount it with `express.raw()` before any JSON parser. You must supply the transactional, persistent queue/deduplication implementation; an in-memory map is not sufficient. Express is optional and is not an SDK dependency.

## Timeouts, cancellation and errors

```javascript
import {Client, APIError, TransportError, RequestAbortedError} from 'whollycrypto';

const client = new Client(apiURL, token, {
  timeoutMs: 20_000, connectTimeoutMs: 5_000,
  maxRetries: 1, maxRetryDelayMs: 30_000,
});
try {
  const result = await client.getInvoice(projectId, publicInvoiceId, {
    signal: AbortSignal.timeout(10_000),
  });
} catch (error) {
  if (error instanceof APIError) {
    const {statusCode, errorCode, retryAfterSeconds} = error;
    // Private diagnostics are opt-in: error.apiMessage / error.response.body.
  } else if (error instanceof RequestAbortedError) {
    // Caller cancellation is never retried automatically.
  } else if (error instanceof TransportError) {
    // A write may have succeeded. Retry its original key, credential and payload.
  } else {
    throw error;
  }
} finally {
  client.close();
}
```

Retries are **off by default**. Opt-in retries cover transient connections and HTTP 429/502/503/504 only for GETs and explicitly idempotent invoice creation. Other writes never auto-retry. At most three retries are allowed. `Retry-After` seconds/HTTP dates are honored; invalid or excessive waits are surfaced instead of retrying early. Budget for each attempt plus backoff; use `AbortSignal` to bound the overall call.

`client.lastResponse?.rateLimit()` exposes limit, remaining and reset when present. `lastResponse` is aggregate state, not a per-request response when calls overlap. It is null if the most recent network attempt has no HTTP response. Default limits: 8 MiB per response, 32 KiB per request, 20-second request timeout and 5-second connection timeout.

TLS/hostname verification is always enabled. No redirects, cookie storage or implicit environment proxies. `ca` accepts your trusted CA's **PEM content**, not a filename. Loopback HTTP requires explicit `allowInsecureLocalhost: true` and is for local testing only. Injected transports receive credentials: only trust reviewed implementations; their lifetime remains caller-owned.

Ordinary client/request inspection and SDK error messages omit credentials and response bodies. This does not protect against a debugger or compromised process. Disable body/local-variable capture in production monitoring and never log tokens, signing secrets or customer payloads.

## Public checkout and Lightning

```javascript
import {CheckoutClient} from 'whollycrypto';

const checkout = new CheckoutClient('https://pay.your-domain.com');
try {
  const view = await checkout.getInvoice(publicInvoiceId);
  const url = checkout.invoiceURL(publicInvoiceId);
} finally {
  checkout.close();
}
```

This separate reader never accepts or sends a merchant API token. It also has `getPreview(project, store?)` and `previewURL(project, store?, state?)`. Preview states are illustrative, not payment evidence. Use returned QR/image URLs rather than reconstructing them.

Preserve `payment_rail`, `asset_decimals`, tags/memos, `payment_uri` and `payable`. Lightning BTC uses **11 atomic decimals (millisatoshis)**; on-chain BTC uses 8. Its payment hash is not a receiving address; use the BOLT11/payment URI. The SDK never signs or sends funds.

## Development

```bash
npm ci --ignore-scripts
npm run check
npm pack --ignore-scripts
```

Tests use mocks and local HTTP/TLS servers, never live invoices or funds. OpenSSL is needed for temporary test certificates. The suite covers all 18 public merchant routes, precision, idempotency, callbacks, TLS, connection reuse and cancellation. See [maintenance notes](https://github.com/whollycrypto-com/whollycrypto-node-sdk/blob/main/docs/maintaining.md).
