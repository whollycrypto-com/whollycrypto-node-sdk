import {inspect} from 'node:util';
import {JSONClient} from './core.js';
import {Client} from './client.js';
import {uuid, decimal} from './validation.js';
import {ValidationError} from './errors.js';
import {isObject} from './json.js';
import type {ClientOptions, RequestOptions} from './options.js';
import type {HTTPResponse} from './models.js';
import type {APIObject, Query, OperatorMerchantCreate, OperatorUserCreate, OperatorCreditAdjustment, OperatorTopupCreate} from './types.js';

/** Server-side Operator API. Never expose its separate credentials in a browser. */
export class OperatorClient {
  readonly #http: JSONClient;
  constructor(baseURL: string, apiToken: string, options: ClientOptions = {}) {
    if (typeof apiToken !== 'string' || !/^wc_operator_[a-f0-9]{32}_[a-f0-9]{64}$/.test(apiToken)) throw new ValidationError('Configure a separate Operator API key, not a merchant key.');
    this.#http = new JSONClient(baseURL, apiToken, options);
  }
  static newIdempotencyKey(): string { return Client.newIdempotencyKey(); }
  get lastResponse(): HTTPResponse | null { return this.#http.lastResponse; }
  close(): void { this.#http.close(); }
  [inspect.custom](): string { return 'OperatorClient()'; }
  toJSON(): never { throw new TypeError('API clients must not be serialized.'); }
  private write(path: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_.-]{16,128}$/.test(idempotencyKey)) throw new ValidationError('Persist a 16–128 character idempotency key before sending.');
    if (!isObject(body)) throw new ValidationError('Payload must be a JSON object.');
    for (const key of ['amount','starting_credit']) if (body[key] !== undefined && body[key] !== null) {
      const value = body[key];
      decimal(key === 'amount' && path.endsWith('/credits/adjustments') && typeof value === 'string' && value.startsWith('-') ? value.slice(1) : value, key);
    }
    return this.#http.request('POST', path, {body, idempotencyKey, options});
  }
  async capabilities(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/capabilities`, {query: filters, options});
  }
  async health(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/health`, {query: filters, options});
  }
  async listMerchants(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants`, {query: filters, options});
  }
  async createMerchant(body: OperatorMerchantCreate, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants`, body, idempotencyKey, options);
  }
  async getMerchant(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}`, {query: filters, options});
  }
  async updateMerchant(merchantId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}`, body, idempotencyKey, options);
  }
  async listUsers(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/users`, {query: filters, options});
  }
  async createUser(merchantId: string, body: OperatorUserCreate, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/users`, body, idempotencyKey, options);
  }
  async getUser(merchantId: string, userId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/users/${uuid(userId)}`, {query: filters, options});
  }
  async updateUser(merchantId: string, userId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/users/${uuid(userId)}`, body, idempotencyKey, options);
  }
  async setUserPassword(merchantId: string, userId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/users/${uuid(userId)}/password`, body, idempotencyKey, options);
  }
  async revokeUserSessions(merchantId: string, userId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/users/${uuid(userId)}/revoke-sessions`, body, idempotencyKey, options);
  }
  async listInvitations(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/invitations`, {query: filters, options});
  }
  async createInvitation(merchantId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/invitations`, body, idempotencyKey, options);
  }
  async getInvitation(invitationId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/invitations/${uuid(invitationId)}`, {query: filters, options});
  }
  async resendInvitation(invitationId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/invitations/${uuid(invitationId)}/resend`, body, idempotencyKey, options);
  }
  async revokeInvitation(invitationId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/invitations/${uuid(invitationId)}/revoke`, body, idempotencyKey, options);
  }
  async getCredits(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/credits`, {query: filters, options});
  }
  async listCreditLedger(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/credits/ledger`, {query: filters, options});
  }
  async adjustCredits(merchantId: string, body: OperatorCreditAdjustment, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/credits/adjustments`, body, idempotencyKey, options);
  }
  async listTopups(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/topups`, {query: filters, options});
  }
  async createTopup(merchantId: string, body: OperatorTopupCreate, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/topups`, body, idempotencyKey, options);
  }
  async getTopup(merchantId: string, topupId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/topups/${uuid(topupId)}`, {query: filters, options});
  }
  async reports(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/reports`, {query: filters, options});
  }
  async listAudit(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/audit`, {query: filters, options});
  }
  async listEvents(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/events`, {query: filters, options});
  }
  async listWebhooks(filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/webhooks`, {query: filters, options});
  }
  async createWebhook(body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/webhooks`, body, idempotencyKey, options);
  }
  async updateWebhook(webhookId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/webhooks/${uuid(webhookId)}`, body, idempotencyKey, options);
  }
  async rotateWebhookSecret(webhookId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/webhooks/${uuid(webhookId)}/rotate`, body, idempotencyKey, options);
  }
  async listWebhookDeliveries(webhookId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/webhooks/${uuid(webhookId)}/deliveries`, {query: filters, options});
  }
  async listProjects(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects`, {query: filters, options});
  }
  async createProject(merchantId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects`, body, idempotencyKey, options);
  }
  async getProject(merchantId: string, projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}`, {query: filters, options});
  }
  async updateProject(merchantId: string, projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}`, body, idempotencyKey, options);
  }
  async listStores(merchantId: string, projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores`, {query: filters, options});
  }
  async createStore(merchantId: string, projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores`, body, idempotencyKey, options);
  }
  async getStore(merchantId: string, projectId: string, storeId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}`, {query: filters, options});
  }
  async updateStore(merchantId: string, projectId: string, storeId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}`, body, idempotencyKey, options);
  }
  async getStoreAppearance(merchantId: string, projectId: string, storeId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/checkout-appearance`, {query: filters, options});
  }
  async updateStoreAppearance(merchantId: string, projectId: string, storeId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/checkout-appearance`, body, idempotencyKey, options);
  }
  async listStorePaymentAssets(merchantId: string, projectId: string, storeId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/payment-assets`, {query: filters, options});
  }
  async updateStorePaymentAssets(merchantId: string, projectId: string, storeId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/payment-assets`, body, idempotencyKey, options);
  }
  async listStoreWebhooks(merchantId: string, projectId: string, storeId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/webhooks`, {query: filters, options});
  }
  async createStoreWebhook(merchantId: string, projectId: string, storeId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/webhooks`, body, idempotencyKey, options);
  }
  async updateStoreWebhook(merchantId: string, projectId: string, storeId: string, webhookId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/stores/${uuid(storeId)}/webhooks/${uuid(webhookId)}`, body, idempotencyKey, options);
  }
  async listInvoices(merchantId: string, projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/invoices`, {query: filters, options});
  }
  async getInvoice(merchantId: string, projectId: string, invoiceId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/invoices/${uuid(invoiceId)}`, {query: filters, options});
  }
  async listWallets(merchantId: string, projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/wallets`, {query: filters, options});
  }
  async listWalletAddresses(merchantId: string, projectId: string, walletId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/projects/${uuid(projectId)}/wallets/${uuid(walletId)}/addresses`, {query: filters, options});
  }
  async listMerchantCredentials(merchantId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', `/v1/operator/merchants/${uuid(merchantId)}/api-credentials`, {query: filters, options});
  }
  async createMerchantCredential(merchantId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/api-credentials`, body, idempotencyKey, options);
  }
  async updateMerchantCredential(merchantId: string, credentialId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/api-credentials/${uuid(credentialId)}`, body, idempotencyKey, options);
  }
  async rotateMerchantCredential(merchantId: string, credentialId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/api-credentials/${uuid(credentialId)}/rotate`, body, idempotencyKey, options);
  }
  async revokeMerchantCredential(merchantId: string, credentialId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(`/v1/operator/merchants/${uuid(merchantId)}/api-credentials/${uuid(credentialId)}/revoke`, body, idempotencyKey, options);
  }
}
