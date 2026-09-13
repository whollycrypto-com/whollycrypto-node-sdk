# Wholly Crypto Node.js SDK

The official JavaScript and TypeScript client for your **self-hosted Wholly Crypto merchant API**. Create invoices, check payments, manage accepted assets and verify IPN/webhooks.

One package. **Node.js 22+**, CommonJS and ES modules, built-in TypeScript declarations, **no runtime dependencies**. MIT licensed. SDK **1.0.0** targets merchant API **v1**, tested against merchant **3.5.0**. SDK and merchant versions are independent.

## Install

```bash
npm install whollycrypto
```

Use this SDK on your **server**, not in a browser or mobile app. API keys must never reach customer devices. Use a security-maintained Node.js release.

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
      amount: '49.90', // A string, never a JavaScript number
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

  const publicInvoiceId = result.data.public_id;
  const checkoutURL = result.links.checkout;
  // Save publicInvoiceId with the order; return checkoutURL to your customer.
} finally {
  client.close();
}
```

These UUIDs are placeholders. A success/return URL is **not proof of payment**. Fulfil only after checking the authenticated invoice, matching the stored order, project/store and amount/currency, then committing fulfilment exactly once.

For a long-running application, reuse one client and close it during shutdown after outstanding requests finish. HTTPS connections are pooled; all network methods return promises. ESM and CommonJS share the same classes, so `instanceof APIError` works across both.

## TypeScript

Types ship in the package; no separate `@types/whollycrypto` installation is needed.

```typescript
import {Client, type InvoiceCreate, type InvoiceResult} from 'whollycrypto';

const payload: InvoiceCreate = {
  amount: '25.00', currency: 'USD',
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

These snippets assume an open client. Invoice paths use `public_id`, not internal `id` or `order_id`. `processing` is not `settled`. Offset pages are separate snapshots: deduplicate by public invoice ID when exporting during incoming payments.

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

## Verify IPN and webhooks

Both use the same signature format. Use the **store's IPN/webhook signing secret**, not an API token. Pass the **exact raw body bytes**, before JSON parsing.

```javascript
import {parseNotification, InvalidSignatureError} from 'whollycrypto';

const notice = parseNotification(rawBody, request.rawHeaders, signingSecret);
// notice.invoiceId: public invoice UUID; notice.sequence: exact decimal string
// Durably enqueue before returning 2xx; failed storage must not be acknowledged.
// Deduplicate by (configuredProjectId, notice.invoiceId, notice.sequence).
```

Catch `InvalidSignatureError` and return HTTP 400. Configuration errors should fail closed. Verification uses HMAC-SHA256, constant-time comparison and a five-minute past/future clock window; keep the server clock synchronized. `verifySignature()` is available for signature-only checks. `parseNotification()` also validates UUIDs, status and sequence, and returns a deeply readonly payload. Body size is limited to 256 KiB.

**Event/delivery ID headers are not signed.** Do not use them alone for replay protection. Use the signed public invoice ID and sequence scoped to your configured project. Re-fetch the authenticated invoice before fulfilment, prevent state regression and handle fulfilment atomically. Event names are not included in the payload or headers.

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

Tests use mocks and local HTTP/TLS servers, never live invoices or funds. OpenSSL is needed for temporary test certificates. The suite covers all 17 public merchant routes, precision, idempotency, callbacks, TLS, connection reuse and cancellation. See [maintenance notes](https://github.com/whollycrypto-com/whollycrypto-node-sdk/blob/main/docs/maintaining.md).
