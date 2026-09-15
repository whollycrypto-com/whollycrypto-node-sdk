# Changelog

## 2.3.0 - 2026-09-15

- Add chain-scoped `asset_tickers` invoice examples for merchant 5.3.0+. Keep UUID selections for backward compatibility and ambiguous symbols.
- Refresh the public API fixtures and document where to copy a store's chain/ticker selection. TypeScript rejects mixed UUID/ticker selectors and non-BTC Lightning tickers.

## 2.2.0 - 2026-09-15

- Document per-invoice chain/asset selection for merchant 5.1.0+, including separate Bitcoin Lightning selection.
- Refresh public API request fixtures and verify exact JSON lists and idempotent retries. Omitted selections retain existing behavior.
- Export InvoicePaymentSelection and type InvoiceCreate.payment_methods for JavaScript/TypeScript consumers.

## 2.1.0 - 2026-09-14

- Support merchant 4.1.0 rich IPN/webhook payload version 2, including signed event identity and project/store scope. Retained legacy events remain supported.
- Add paginated invoice payment-history reads, with exact amounts, rail/asset identifiers and invalidated observations.
- Update receiver examples to compare invoice-state fields when deduplicating a revision, so separate events at the same sequence are accepted. Reject wrong signed project scope and conflicting state.
- Document locked rates versus advisory market snapshots, tolerance, confirmation handling, truncation, privacy and safe fulfilment. Refresh every public API fixture and callback example.

## 2.0.0 - 2026-09-14

- Target merchant 4.0.0: invoice responses and TypeScript declarations use `invoice_id`, matching IPN/webhooks; `public_id` is removed. Update custom response readers before upgrading the merchant.
- Refresh all request/response fixtures, create/list examples and history documentation. Node.js 22+ support and callback verification are unchanged.

- Explain IPN versus webhook selection and secrets, all invoice statuses and the complete callback body.
- Add callback setup/worker guidance and a verified JSON sample in examples, with links to the live documentation.
- Show string casts for amount variables and explain why floating-point calculations lose precision.


SDK versions are independent of merchant versions.

## 1.0.1 - 2026-09-14

- Document installation from the prebuilt GitHub release without npm, node_modules or a build step.
- Add local-import examples for JavaScript ES modules, CommonJS and TypeScript.
- Test isolated manual installations, shared class identity, exact invoice bytes and included TypeScript declarations.
- No API, request encoding, invoice idempotency or callback-signature changes. Still targets merchant API v1, tested against merchant 3.5.0.

## 1.0.0 - 2026-09-13

- Initial MIT-licensed Node.js SDK, supporting JavaScript and TypeScript on Node.js 22+.
- CommonJS and ES modules share one implementation, with built-in declarations and no runtime dependencies.
- All 17 public merchant API v1 routes, lazy invoice pagination and a separate token-free checkout reader.
- Exact monetary strings, explicit invoice idempotency, bounded opt-in retries, cancellation and verified HTTPS connection reuse.
- IPN/webhook signature validation with readonly payloads and a durable-queue receiver integration example.
- Tests on Node.js 22, 24 and 26, including real loopback HTTP/TLS and public-contract fixture checks against merchant 3.5.0.
