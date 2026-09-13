import {inspect} from 'node:util';
import {JSONClient} from './core.js';
import {uuid} from './validation.js';
import {ValidationError} from './errors.js';
import type {ClientOptions, RequestOptions} from './options.js';
import type {APIObject, CheckoutState} from './types.js';
import type {HTTPResponse} from './models.js';

/** Optional public reader. Never accepts, holds or sends a merchant API token. */
export class CheckoutClient {
  readonly #http: JSONClient;
  constructor(baseURL: string, options: ClientOptions = {}) { this.#http = new JSONClient(baseURL, undefined, options); }
  get lastResponse(): HTTPResponse | null { return this.#http.lastResponse; }
  close(): void { this.#http.close(); }
  [inspect.custom](): string { return 'CheckoutClient()'; }
  async getInvoice(publicInvoiceId: string, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', '/checkout-api/invoices/' + uuid(publicInvoiceId), {authenticated: false, options});
  }
  async getPreview(projectId: string, storeId?: string, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET', '/checkout-api/previews/' + uuid(projectId), {query: {store_id: storeId === undefined ? undefined : uuid(storeId)}, authenticated: false, options});
  }
  invoiceURL(publicInvoiceId: string): string { return this.#http.url('/invoice/' + uuid(publicInvoiceId)); }
  previewURL(projectId: string, storeId?: string, state: CheckoutState = 'waiting'): string {
    if (!['waiting','confirming','paid','underpaid','expired'].includes(state)) throw new ValidationError('Invalid illustrative checkout preview state.');
    return this.#http.url('/invoice/preview/' + uuid(projectId), {store_id: storeId === undefined ? undefined : uuid(storeId), state});
  }
}
