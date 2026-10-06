import {inspect} from 'node:util';
import {JSONClient} from './core.js';
import {Client} from './client.js';
import {uuid, decimal} from './validation.js';
import {ValidationError} from './errors.js';
import {isObject} from './json.js';
import type {ClientOptions, RequestOptions} from './options.js';
import type {HTTPResponse} from './models.js';
import type {APIObject, Query} from './types.js';

/** Trusted-server integration. Never expose Marketplace keys in customer code. */
export class MarketplaceClient {
  readonly #http: JSONClient;
  constructor(baseURL: string, apiToken: string, options: ClientOptions = {}) {
    if(typeof apiToken!=='string'||!/^wc_marketplace_[a-f0-9]{32}_[a-f0-9]{64}$/.test(apiToken))throw new ValidationError('Use a separate scoped Marketplace API key.');
    this.#http=new JSONClient(baseURL,apiToken,options);
  }
  static newIdempotencyKey(): string { return Client.newIdempotencyKey(); }
  get lastResponse(): HTTPResponse | null { return this.#http.lastResponse; }
  close(): void { this.#http.close(); }
  [inspect.custom](): string { return 'MarketplaceClient()'; }
  toJSON(): never { throw new TypeError('API clients must not be serialized.'); }
  private scoped<T extends Query | APIObject>(projectId: string, data: T): T & {project_id: string} {
    const id=uuid(projectId);
    if(data.project_id!==undefined&&data.project_id!==id)throw new ValidationError('Conflicting project_id.');
    return {...data,project_id:id};
  }
  private read(projectId: string, path: string, filters: Query | undefined, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('GET',path,{query:this.scoped(projectId,filters??{}),options});
  }
  private money(body: APIObject): void {
    for(const[key,value]of Object.entries(body)){
      if(value===null||value===undefined)continue;
      if(['amount','gross_amount','commission_percent','exchange_rate_spread_percent','underpayment_tolerance_percent'].includes(key))decimal(value,key);
      if(key.endsWith('_atomic')&&(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,77})$/.test(value)))throw new ValidationError('Atomic amounts must be exact nonnegative integer strings.');
    }
    for(const key of ['allocations','stores'])if(body[key]!==undefined){
      const rows=body[key];if(!Array.isArray(rows))throw new ValidationError('Expected a list.');
      for(const row of rows){if(!isObject(row))throw new ValidationError('Expected an object.');this.money(row);}
    }
  }
  private write(projectId: string, path: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_.-]{16,128}$/.test(idempotencyKey))throw new ValidationError('Persist a 16–128 character idempotency key before sending.');
    if(!isObject(body))throw new ValidationError('Payload must be a JSON object.');
    this.money(body);
    return this.#http.request('POST',path,{body:this.scoped(projectId,body),idempotencyKey,options});
  }
  /** GET /v1/marketplace/capabilities; marketplace.read. */
  async capabilities(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/capabilities`, filters, options);
  }
  /** GET /v1/marketplace/overview; marketplace.read. */
  async overview(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/overview`, filters, options);
  }
  /** GET /v1/marketplace/settings; marketplace.read. */
  async settings(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/settings`, filters, options);
  }
  /** POST /v1/marketplace/settings; policies.write. */
  async saveSettings(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/settings`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/vendors; marketplace.read. */
  async listVendors(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/vendors`, filters, options);
  }
  /** POST /v1/marketplace/vendors; vendors.write. */
  async createVendor(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/vendors/{vendor_id}; marketplace.read. */
  async getVendor(projectId: string, vendorId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}`, filters, options);
  }
  /** POST /v1/marketplace/vendors/{vendor_id}/update; vendors.write. */
  async updateVendor(projectId: string, vendorId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/update`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/vendors/{vendor_id}/archive; vendors.write. */
  async archiveVendor(projectId: string, vendorId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/archive`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/vendors/{vendor_id}/destinations; marketplace.read. */
  async listDestinations(projectId: string, vendorId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/destinations`, filters, options);
  }
  /** POST /v1/marketplace/vendors/{vendor_id}/destinations; destinations.write. */
  async addDestination(projectId: string, vendorId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/destinations`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/vendors/{vendor_id}/destinations/{destination_id}/approve; destinations.approve. */
  async approveDestination(projectId: string, vendorId: string, destinationId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/destinations/${uuid(destinationId)}/approve`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/vendors/{vendor_id}/destinations/{destination_id}/disable; destinations.approve. */
  async disableDestination(projectId: string, vendorId: string, destinationId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/destinations/${uuid(destinationId)}/disable`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/vendors/{vendor_id}/balances; marketplace.read. */
  async vendorBalances(projectId: string, vendorId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/vendors/${uuid(vendorId)}/balances`, filters, options);
  }
  /** GET /v1/marketplace/invoices; marketplace.read. */
  async listInvoices(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/invoices`, filters, options);
  }
  /** POST /v1/marketplace/invoices; invoices.write. */
  async createInvoice(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/invoices/{invoice_id}; marketplace.read. */
  async getInvoice(projectId: string, invoiceId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}`, filters, options);
  }
  /** GET /v1/marketplace/invoices/{invoice_id}/payments; marketplace.read. */
  async invoicePayments(projectId: string, invoiceId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/payments`, filters, options);
  }
  /** GET /v1/marketplace/invoices/{invoice_id}/allocations; marketplace.read. */
  async invoiceAllocations(projectId: string, invoiceId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/allocations`, filters, options);
  }
  /** POST /v1/marketplace/invoices/{invoice_id}/cancel; invoices.write. */
  async cancelInvoice(projectId: string, invoiceId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/cancel`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/invoices/{invoice_id}/allocations/hold; reconciliation.write. */
  async holdInvoice(projectId: string, invoiceId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/allocations/hold`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/invoices/{invoice_id}/allocations/release; reconciliation.write. */
  async releaseInvoice(projectId: string, invoiceId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/allocations/release`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/invoices/{invoice_id}/allocations/{allocation_id}/destination; reconciliation.write. */
  async rebindDestination(projectId: string, invoiceId: string, allocationId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/allocations/${uuid(allocationId)}/destination`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/invoices/{invoice_id}/refund; reconciliation.write. */
  async refundInvoice(projectId: string, invoiceId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/invoices/${uuid(invoiceId)}/refund`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/allocations; marketplace.read. */
  async allocations(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/allocations`, filters, options);
  }
  /** GET /v1/marketplace/balances; marketplace.read. */
  async balances(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/balances`, filters, options);
  }
  /** GET /v1/marketplace/ledger; marketplace.read. */
  async ledger(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/ledger`, filters, options);
  }
  /** GET /v1/marketplace/payouts; marketplace.read. */
  async listPayouts(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/payouts`, filters, options);
  }
  /** POST /v1/marketplace/payouts/preview; payouts.write. */
  async previewPayout(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/payouts/preview`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/payouts; payouts.write. */
  async createPayout(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/payouts`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/payouts/{payout_id}; marketplace.read. */
  async getPayout(projectId: string, payoutId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/payouts/${uuid(payoutId)}`, filters, options);
  }
  /** POST /v1/marketplace/payouts/{payout_id}/approve; payouts.approve. */
  async approvePayout(projectId: string, payoutId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/payouts/${uuid(payoutId)}/approve`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/payouts/{payout_id}/resume; payouts.approve. */
  async resumePayout(projectId: string, payoutId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/payouts/${uuid(payoutId)}/resume`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/payouts/{payout_id}/cancel; payouts.write. */
  async cancelPayout(projectId: string, payoutId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/payouts/${uuid(payoutId)}/cancel`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/policies; marketplace.read. */
  async listPolicies(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/policies`, filters, options);
  }
  /** POST /v1/marketplace/policies; policies.write. */
  async savePolicy(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/policies`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/webhooks; marketplace.read. */
  async listWebhooks(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/webhooks`, filters, options);
  }
  /** POST /v1/marketplace/webhooks; webhooks.write. */
  async createWebhook(projectId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/webhooks`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/webhooks/{webhook_id}/update; webhooks.write. */
  async updateWebhook(projectId: string, webhookId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/webhooks/${uuid(webhookId)}/update`, body, idempotencyKey, options);
  }
  /** POST /v1/marketplace/webhooks/{webhook_id}/disable; webhooks.write. */
  async disableWebhook(projectId: string, webhookId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/webhooks/${uuid(webhookId)}/disable`, body, idempotencyKey, options);
  }
  /** GET /v1/marketplace/events; marketplace.read. */
  async listEvents(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/events`, filters, options);
  }
  /** GET /v1/marketplace/events/{event_id}; marketplace.read. */
  async getEvent(projectId: string, eventId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/events/${uuid(eventId)}`, filters, options);
  }
  /** GET /v1/marketplace/webhook-deliveries; marketplace.read. */
  async listDeliveries(projectId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/webhook-deliveries`, filters, options);
  }
  /** GET /v1/marketplace/webhook-deliveries/{delivery_id}; marketplace.read. */
  async getDelivery(projectId: string, deliveryId: string, filters?: Query, options?: RequestOptions): Promise<APIObject> {
    return this.read(projectId, `/v1/marketplace/webhook-deliveries/${uuid(deliveryId)}`, filters, options);
  }
  /** POST /v1/marketplace/webhook-deliveries/{delivery_id}/resend; webhooks.write. */
  async resendDelivery(projectId: string, deliveryId: string, body: APIObject, idempotencyKey: string, options?: RequestOptions): Promise<APIObject> {
    return this.write(projectId, `/v1/marketplace/webhook-deliveries/${uuid(deliveryId)}/resend`, body, idempotencyKey, options);
  }
}
