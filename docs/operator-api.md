# Operator API

Requires Wholly Crypto 7.4.0+, an installation permanently set to Operator mode, and opt-in under Operator → Settings → Operator API. Use the **API hostname**, with a separate scoped `wc_operator_` key kept on your server. Ordinary merchant keys cannot manage tenants.

[Full Operator API reference](https://www.whollycrypto.com/api/#operator-api) · [Create merchant fields](https://www.whollycrypto.com/api/#operator-create-merchant)

Choose direct onboarding with a password, or invitation onboarding without a password. Direct users must acknowledge hosted-wallet custody at first login; temporary passwords can require a change. Invitation acceptance sets a password but never logs in or bypasses Basic Auth/TOTP. Only set custody acknowledgement after the person has actually agreed.

Every Operator POST requires a persisted 16–128 character idempotency key. Keep the same key and exact body after a timeout. Secrets and private links are shown only on the first successful response; replay returns a redacted receipt. An interrupted request returns `operator_request_in_progress`: inspect resources/audit instead of blindly submitting a new key. Persist request IDs for credit adjustments/top-ups too. A local credit grant does not refill the installation's own credit balance.

Default key quota: 60/minute, configurable 1–600. Honour Retry-After on 429. Scope/IP/expiry/tenant checks apply to every request. There are no public wallet-secret, spending, refund, destructive deletion, TOTP-reset or server-configuration operations.

Operator webhooks are **not invoice callbacks**. Use the generic signature verifier over the raw body and Wholly-Signature, then validate merchant_id/event_type and transactionally deduplicate event_id. Do not feed them into the invoice-notification parser. Subscriptions belong to their issuing credential. Deliveries are at least once, may be out of order, retry up to 8 attempts and retain history for 30 days. Return 2xx only after durable acceptance; reconcile against current resources. Do not use a lifecycle event alone to fulfil a customer's order.

## Methods

| Method | HTTP | Path |
| --- | --- | --- |
| `capabilities` | GET | `/v1/operator/capabilities` |
| `health` | GET | `/v1/operator/health` |
| `listMerchants` | GET | `/v1/operator/merchants` |
| `createMerchant` | POST | `/v1/operator/merchants` |
| `getMerchant` | GET | `/v1/operator/merchants/{merchant_id}` |
| `updateMerchant` | POST | `/v1/operator/merchants/{merchant_id}` |
| `listUsers` | GET | `/v1/operator/merchants/{merchant_id}/users` |
| `createUser` | POST | `/v1/operator/merchants/{merchant_id}/users` |
| `getUser` | GET | `/v1/operator/merchants/{merchant_id}/users/{user_id}` |
| `updateUser` | POST | `/v1/operator/merchants/{merchant_id}/users/{user_id}` |
| `setUserPassword` | POST | `/v1/operator/merchants/{merchant_id}/users/{user_id}/password` |
| `revokeUserSessions` | POST | `/v1/operator/merchants/{merchant_id}/users/{user_id}/revoke-sessions` |
| `listInvitations` | GET | `/v1/operator/merchants/{merchant_id}/invitations` |
| `createInvitation` | POST | `/v1/operator/merchants/{merchant_id}/invitations` |
| `getInvitation` | GET | `/v1/operator/invitations/{invitation_id}` |
| `resendInvitation` | POST | `/v1/operator/invitations/{invitation_id}/resend` |
| `revokeInvitation` | POST | `/v1/operator/invitations/{invitation_id}/revoke` |
| `getCredits` | GET | `/v1/operator/merchants/{merchant_id}/credits` |
| `listCreditLedger` | GET | `/v1/operator/merchants/{merchant_id}/credits/ledger` |
| `adjustCredits` | POST | `/v1/operator/merchants/{merchant_id}/credits/adjustments` |
| `listTopups` | GET | `/v1/operator/merchants/{merchant_id}/topups` |
| `createTopup` | POST | `/v1/operator/merchants/{merchant_id}/topups` |
| `getTopup` | GET | `/v1/operator/merchants/{merchant_id}/topups/{topup_id}` |
| `reports` | GET | `/v1/operator/reports` |
| `listAudit` | GET | `/v1/operator/audit` |
| `listEvents` | GET | `/v1/operator/events` |
| `listWebhooks` | GET | `/v1/operator/webhooks` |
| `createWebhook` | POST | `/v1/operator/webhooks` |
| `updateWebhook` | POST | `/v1/operator/webhooks/{webhook_id}` |
| `rotateWebhookSecret` | POST | `/v1/operator/webhooks/{webhook_id}/rotate` |
| `listWebhookDeliveries` | GET | `/v1/operator/webhooks/{webhook_id}/deliveries` |
| `listProjects` | GET | `/v1/operator/merchants/{merchant_id}/projects` |
| `createProject` | POST | `/v1/operator/merchants/{merchant_id}/projects` |
| `getProject` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}` |
| `updateProject` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}` |
| `listStores` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores` |
| `createStore` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores` |
| `getStore` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}` |
| `updateStore` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}` |
| `getStoreAppearance` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/checkout-appearance` |
| `updateStoreAppearance` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/checkout-appearance` |
| `listStorePaymentAssets` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/payment-assets` |
| `updateStorePaymentAssets` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/payment-assets` |
| `listStoreWebhooks` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/webhooks` |
| `createStoreWebhook` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/webhooks` |
| `updateStoreWebhook` | POST | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/stores/{store_id}/webhooks/{webhook_id}` |
| `listInvoices` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/invoices` |
| `getInvoice` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/invoices/{invoice_id}` |
| `listWallets` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/wallets` |
| `listWalletAddresses` | GET | `/v1/operator/merchants/{merchant_id}/projects/{project_id}/wallets/{wallet_id}/addresses` |
| `listMerchantCredentials` | GET | `/v1/operator/merchants/{merchant_id}/api-credentials` |
| `createMerchantCredential` | POST | `/v1/operator/merchants/{merchant_id}/api-credentials` |
| `updateMerchantCredential` | POST | `/v1/operator/merchants/{merchant_id}/api-credentials/{credential_id}` |
| `rotateMerchantCredential` | POST | `/v1/operator/merchants/{merchant_id}/api-credentials/{credential_id}/rotate` |
| `revokeMerchantCredential` | POST | `/v1/operator/merchants/{merchant_id}/api-credentials/{credential_id}/revoke` |

Token-only onboarding uses the separate `OperatorOnboardingClient`: `checkInvitation(token)` and `acceptInvitation(token, password, custodyAcknowledged)`. No Operator key is sent. See the adjacent examples; they are templates, never run them against a production installation without reviewing the changes.
