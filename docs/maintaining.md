# SDK maintenance

This repository contains only the public client SDK and inert examples. Never copy merchant implementation, private-service code, credentials or wallet data into it. SDK semantic versions are independent of merchant releases.

When public API routes, payloads, permissions or behavior change:

1. Update methods, exported types, examples and `tests/fixtures/api-v1.json` together.
2. Extend validation, exact wire-byte, precision, signature and retry tests.
3. Run `npm ci --ignore-scripts` and `npm run check` on Node.js 22 and current supported runtimes. Test both CommonJS and ESM consumers.
4. Run the public-contract drift check below. The input is public documentation only, not server implementation.
5. Update `package.json`, its lockfile, `src/core.ts` and `CHANGELOG.md`; build, audit `npm pack --ignore-scripts`, and test installation of the actual tarball.
6. Publish an immutable Git tag/release and the reviewed npm tarball. Verify public registry metadata/integrity and a clean install from npm.

```bash
node tools/check-api-coverage.mjs /path/to/api-docs.js /path/to/api-examples.js
npm run check
npm pack --ignore-scripts
```

Build outputs are generated under `dist`; they are included in npm, not Git. No lifecycle hook silently builds or runs on installation. Consumers do not need a compiler. Tests use temporary loopback HTTP/TLS servers and OpenSSL, never live invoices or funds.

Package contents are allowlisted in `package.json`. Keep publishing credentials and private operator scripts outside the repository. Never commit an npm token or put it in a command argument. Use a restricted publishing token or appropriately configured trusted publishing.

Review canonical JSON changes carefully: invoice idempotency binds the exact raw request bytes, not semantic equality. Released versions/tags must never be rewritten.
