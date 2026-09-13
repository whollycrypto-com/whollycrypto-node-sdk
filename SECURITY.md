# Security

Report vulnerabilities privately through the [Wholly Crypto contact form](https://www.whollycrypto.com/contact/). Never put API tokens, signing secrets, wallet material or customer data in public GitHub issues.

Use the current 1.x SDK and a security-maintained Node.js runtime. This is a server-side client SDK, not merchant-server or private-service implementation. It does not hold wallet keys or send funds.

Configure the API origin on your server, never from customer input. Limit each API credential to the necessary projects/permissions and use source-IP restrictions when appropriate. TLS verification cannot be disabled. Only trust reviewed CA bundles and custom transports, which receive credentials.

Normal inspection and SDK errors omit tokens and response bodies. Debuggers, request instrumentation and explicitly accessed `APIError.apiMessage` or `response.body` can still expose private data. Disable body/local-variable capture in production monitoring. A compromised server cannot be made safe by SDK redaction.

Persist the original idempotency key, payload and credential identity before invoice creation. A timeout is not proof of failure. Retry with identical raw bytes; do not silently create a new key after an uncertain outcome.

Verify callback bytes before parsing. Signatures cover the timestamp/body, not event/delivery headers. Deduplicate by signed public invoice ID and sequence, scoped to your configured project. Durably commit the callback before acknowledging it. Re-fetch the authenticated invoice, verify the expected order/amount/currency and fulfil once transactionally, without rolling state backwards.

Success URLs and checkout previews are not proof of payment. Tests must never use live invoice writes or real wallet credentials. Publishing tokens and private operational scripts belong outside this repository.
