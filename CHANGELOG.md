# Changelog

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
