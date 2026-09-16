import {inspect} from 'node:util';
import type {HTTPResponse} from './models.js';
import {decodeJSON, isObject} from './json.js';

export class WhollyCryptoError extends Error {
  constructor(message: string) { super(message); this.name = new.target.name; }
  [inspect.custom](): string { return `${this.name}: ${this.message}`; }
  toJSON(): {name: string; message: string} { return {name: this.name, message: this.message}; }
}
export class ValidationError extends WhollyCryptoError {}
export class InvalidResponseError extends WhollyCryptoError {}
export class InvalidSignatureError extends WhollyCryptoError {}
export class RequestAbortedError extends WhollyCryptoError {
  constructor() { super('The request was aborted. This does not prove a write failed.'); }
}
export class TransportError extends WhollyCryptoError {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) { super(message); this.retryable = retryable; }
}
export class APIError extends WhollyCryptoError {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly #response: HTTPResponse;
  readonly #apiMessage: string | null;
  constructor(response: HTTPResponse, errorCode: string, apiMessage: string | null) {
    super(`Wholly Crypto API returned HTTP ${response.statusCode} (${errorCode}).` + safePaymentSummary(response, errorCode));
    this.statusCode = response.statusCode; this.errorCode = errorCode;
    this.#response = response; this.#apiMessage = apiMessage;
  }
  /** Private diagnostics: may contain customer data. Never log response bodies by default. */
  get response(): HTTPResponse { return this.#response; }
  get apiMessage(): string | null { return this.#apiMessage; }
  /** Explicit private diagnostics. Never log complete response details by default. */
  get details(): Record<string, unknown> { return paymentDetails(this.#response); }
  get paymentMethodIssues(): ReadonlyArray<Record<string, unknown>> { return paymentIssues(this.#response); }
  get retryAfterSeconds(): number | null { return this.#response.retryAfterSeconds(); }
}

function paymentDetails(response: HTTPResponse): Record<string, unknown> {
  try { const body = decodeJSON(response.body);
    return isObject(body) && isObject(body.error) && isObject(body.error.details) ? body.error.details : {};
  } catch { return {}; }
}
function paymentIssues(response: HTTPResponse): Record<string, unknown>[] {
  const issues = paymentDetails(response).payment_methods;
  return Array.isArray(issues) ? issues.slice(0, 64).filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];
}
function safePaymentSummary(response: HTTPResponse, code: string): string {
  if (!['invalid_payment_request','no_ready_payment_methods','payment_rates_unavailable','lightning_unavailable'].includes(code)) return '';
  const chains: Record<string,string> = {ethereum:'Ethereum',base:'Base','bnb-chain':'BNB Smart Chain',hyperliquid:'Hyperliquid',bitcoin:'Bitcoin','bitcoin-cash':'Bitcoin Cash',litecoin:'Litecoin',dogecoin:'Dogecoin',zcash:'Zcash',solana:'Solana',tron:'TRON','xrp-ledger':'XRP Ledger',monero:'Monero',cardano:'Cardano',stellar:'Stellar',avalanche:'Avalanche',polygon:'Polygon',arbitrum:'Arbitrum One',optimism:'Optimism',ton:'TON',aptos:'Aptos',sui:'Sui',cosmos:'Cosmos Hub',polkadot:'Polkadot Hub',near:'NEAR',algorand:'Algorand',hedera:'Hedera',kaspa:'Kaspa',tezos:'Tezos',dash:'Dash'};
  const reasons: Record<string,string> = {
    scanner_provider_quorum:'Two independent scanner-compatible providers are required. Check Settings > Chain connections.',
    scanner_not_checked:'Scanner checks are missing or stale. Check Settings > Chain connections.',
    scanner_unavailable:'Receive scanner unavailable. Check Settings > Chain connections.',
    wallet_missing:'Create the project wallet.',wallet_disabled:'Enable the project wallet.',
    wallet_backup_required:'Back up the project wallet and confirm its backup.',
    wallet_key_unavailable:'Wallet key unavailable. Check the project wallet configuration.',
    wallet_activation_required:'Verify on-chain activation of the receiving account.',
    monero_binding_unavailable:'Verify the view-only Monero wallet connection and backup.',
    custom_rate_unavailable:'Configure a current custom token price.',rate_unavailable:'A fresh trustworthy exchange rate is unavailable. Check Settings > Rates.',
    lightning_unavailable:'Check the Lightning connection and project access.',project_disabled:'Enable the project.',store_disabled:'Enable the store.',chain_disabled:'Enable the chain in payment methods.',asset_disabled:'Enable the asset in payment methods.',asset_not_accepted:'Select an asset accepted by the store.',
  };
  const messages = [...new Set(paymentIssues(response).flatMap(issue => {
    const reason=issue.reason_code, chain=issue.chain_slug, count=issue.usable_independent_providers;
    if(typeof reason!=='string'||!Object.hasOwn(reasons,reason))return [];
    const label=typeof chain==='string'&&Object.hasOwn(chains,chain)?chains[chain]:'Payment method';
    const prefix=reason==='scanner_provider_quorum'&&Number.isInteger(count)&&typeof count==='number'&&count>=0&&count<=2?`${count} of 2 independent scanner providers are usable. `:'';
    return [`${label}: ${prefix}${reasons[reason]}`];
  }))];
  return messages.length?' '+messages.slice(0,3).join(' ')+(messages.length>3?' More payment-method issues are available in paymentMethodIssues.':''):'';
}
