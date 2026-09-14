import {randomBytes} from 'node:crypto';
import {inspect} from 'node:util';
import {JSONClient} from './core.js';
import {decimal, uuid} from './validation.js';
import {encodeBody, isObject} from './json.js';
import {InvalidResponseError, ValidationError} from './errors.js';
import type {ClientOptions, RequestOptions} from './options.js';
import type {HTTPResponse} from './models.js';
import type {InvoicePaymentFilters, InvoicePaymentPage} from './types.js';
import type {APIObject, AssetPolicyUpdate, ConfirmationPolicyUpdate, CustomTokenRegistration, Envelope, Invoice, InvoiceCreate, InvoiceFilters, InvoicePage, InvoiceResult, ProjectPaymentAsset, Query, ReconciliationDetail, ReconciliationPage, RegisteredAsset, StoreAssetSelection, StoreAssetsResult, TokenFilters, TokenRegistration, Wallet} from './types.js';

const project = (id: string) => '/v1/projects/' + uuid(id);
const store = (projectId: string, storeId: string) => project(projectId) + '/stores/' + uuid(storeId);

export class Client {
  readonly #http: JSONClient;
  constructor(baseURL: string, apiToken: string, options: ClientOptions = {}) {
    if (apiToken === undefined || apiToken === null) throw new ValidationError('Configure a merchant API token.');
    this.#http = new JSONClient(baseURL, apiToken, options);
  }
  /** Most recently received response. Not per-request state when calls overlap. */
  get lastResponse(): HTTPResponse | null { return this.#http.lastResponse; }
  close(): void { this.#http.close(); }
  [inspect.custom](): string { return 'Client()'; }
  toJSON(): never { throw new TypeError('API clients containing credentials must not be serialized.'); }
  /** Generate once and persist with the original invoice payload before sending. */
  static newIdempotencyKey(): string { return randomBytes(24).toString('hex'); }
  async serviceInfo(options?: RequestOptions): Promise<APIObject> { return this.#http.request('GET', '/', {authenticated: false, options}); }
  async health(options?: RequestOptions): Promise<APIObject> { return this.#http.request('GET', '/healthz', {authenticated: false, options}); }
  async createInvoice(projectId: string, storeId: string, invoice: InvoiceCreate, idempotencyKey: string, options?: RequestOptions): Promise<InvoiceResult> {
    if (!isObject(invoice)) throw new ValidationError('Invoice must be a JSON object.');
    // Validate before reading/spreading fields so accessors never run implicitly.
    encodeBody(invoice);
    const body = {...invoice, amount: decimal(invoice.amount, 'amount')};
    for (const key of ['exchange_rate_spread_percent','underpayment_tolerance_percent'] as const) if (body[key] !== undefined && body[key] !== null) decimal(body[key], key);
    for (const key of ['metadata','checkout_appearance'] as const) if (body[key] !== undefined && body[key] !== null && !isObject(body[key])) throw new ValidationError(key + ' must be an object, not a list.');
    if (idempotencyKey === undefined || idempotencyKey === null) throw new ValidationError('Invoice creation requires an explicit, persisted idempotency key.');
    return this.#http.request('POST', store(projectId, storeId) + '/invoices', {body, idempotencyKey, options});
  }
  async getInvoice(projectId: string, publicInvoiceId: string, options?: RequestOptions): Promise<InvoiceResult> {
    return this.#http.request('GET', project(projectId) + '/invoices/' + uuid(publicInvoiceId), {options});
  }
  async listInvoices(projectId: string, filters?: InvoiceFilters, options?: RequestOptions): Promise<InvoicePage> {
    return this.#http.request('GET', project(projectId) + '/invoices', {query: filters, options});
  }
  /** Complete current observations, including invalidated transfers; never sum different assets. */
  async listInvoicePayments(projectId: string, invoiceId: string, filters?: InvoicePaymentFilters, options?: RequestOptions): Promise<InvoicePaymentPage> {
    return this.#http.request('GET', project(projectId) + '/invoices/' + uuid(invoiceId) + '/payments', {query: filters, options});
  }
  async *iterateInvoices(projectId: string, filters: InvoiceFilters = {}, options?: RequestOptions): AsyncGenerator<Invoice> {
    if (!isObject(filters)) throw new ValidationError('Invoice filters must be an object.');
    const query = {...filters}, limit = query.limit ?? 50; let offset = query.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError('Invalid invoice pagination limit or offset.');
    for (;;) {
      const result = await this.listInvoices(projectId, {...query, limit, offset}, options);
      if (!Array.isArray(result.data) || !isObject(result.pagination) || result.pagination.offset !== offset
          || result.pagination.limit !== limit || typeof result.pagination.has_more !== 'boolean') throw new InvalidResponseError('Invalid invoice pagination metadata.');
      for (const invoice of result.data) {
        if (!isObject(invoice)) throw new InvalidResponseError('Invoice list contains an invalid item.');
        yield invoice;
      }
      if (!result.pagination.has_more) return;
      if (!result.data.length || offset + limit > 1_000_000) throw new InvalidResponseError('Invoice pagination cannot advance safely.');
      offset += limit;
    }
  }
  async listProjectPaymentAssets(projectId: string, options?: RequestOptions): Promise<Envelope<ProjectPaymentAsset[]>> {
    return this.#http.request('GET', project(projectId) + '/payment-assets', {options});
  }
  async updateProjectPaymentAsset(projectId: string, assetId: string, policy: AssetPolicyUpdate, options?: RequestOptions): Promise<Envelope<ProjectPaymentAsset[]>> {
    return this.#http.request('PUT', project(projectId) + '/payment-assets/' + uuid(assetId), {body: policy, options});
  }
  async listTokenCandidates(projectId: string, chainSlug: string, filters: TokenFilters = {}, options?: RequestOptions): Promise<Envelope<APIObject[]>> {
    if (!isObject(filters)) throw new ValidationError('Token filters must be an object.');
    return this.#http.request('GET', project(projectId) + '/payment-token-candidates', {query: {...filters, chain_slug: chainSlug}, options});
  }
  async registerTokenAsset(projectId: string, token: TokenRegistration, options?: RequestOptions): Promise<Envelope<RegisteredAsset>> {
    return this.#http.request('POST', project(projectId) + '/payment-token-assets', {body: token, options});
  }
  async discoverCustomDexPools(projectId: string, chainSlug: string, contractAddress: string, options?: RequestOptions): Promise<Envelope<APIObject[]>> {
    return this.#http.request('GET', project(projectId) + '/payment-token-dex-pools', {query: {chain_slug: chainSlug, contract_address: contractAddress}, options});
  }
  async registerCustomToken(projectId: string, token: CustomTokenRegistration, options?: RequestOptions): Promise<Envelope<RegisteredAsset>> {
    if (!isObject(token)) throw new ValidationError('Token must be a JSON object.');
    encodeBody(token);
    if (token.price_usd !== undefined && token.price_usd !== null) decimal(token.price_usd, 'price_usd');
    return this.#http.request('POST', project(projectId) + '/payment-token-assets/custom', {body: token, options});
  }
  async listStorePaymentAssets(projectId: string, storeId: string, options?: RequestOptions): Promise<StoreAssetsResult> {
    return this.#http.request('GET', store(projectId, storeId) + '/payment-assets', {options});
  }
  /** REPLACES the entire on-chain selection. [] clears it. Does not configure Lightning. */
  async updateStorePaymentAssets(projectId: string, storeId: string, assets: readonly StoreAssetSelection[], options?: RequestOptions): Promise<StoreAssetsResult> {
    if (!Array.isArray(assets)) throw new ValidationError('assets must be the full list of asset_id/display_order objects.');
    return this.#http.request('PUT', store(projectId, storeId) + '/payment-assets', {body: {assets}, options});
  }
  async updateStoreConfirmationPolicy(projectId: string, storeId: string, assetId: string, policy: ConfirmationPolicyUpdate, options?: RequestOptions): Promise<StoreAssetsResult> {
    return this.#http.request('PUT', store(projectId, storeId) + '/payment-assets/' + uuid(assetId) + '/confirmation-policy', {body: policy, options});
  }
  async listProjectWallets(projectId: string, options?: RequestOptions): Promise<Envelope<Wallet[]>> {
    return this.#http.request('GET', project(projectId) + '/wallets', {options});
  }
  async listReconciliation(projectId: string, filters?: Query, options?: RequestOptions): Promise<ReconciliationPage> {
    return this.#http.request('GET', project(projectId) + '/reconciliation', {query: filters, options});
  }
  async getReconciliation(projectId: string, publicInvoiceId: string, page = 1, options?: RequestOptions): Promise<ReconciliationDetail> {
    return this.#http.request('GET', project(projectId) + '/reconciliation/' + uuid(publicInvoiceId), {query: {page}, options});
  }
}
