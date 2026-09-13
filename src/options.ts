import {ValidationError} from './errors.js';
import {isObject} from './json.js';
import type {Transport} from './transport.js';

export interface ClientOptions {
  timeoutMs?: number; connectTimeoutMs?: number;
  maxRetries?: number; maxRetryDelayMs?: number; maxResponseBytes?: number;
  allowInsecureLocalhost?: boolean;
  /** PEM-encoded trusted CA, not a path. Never disables hostname/certificate verification. */
  ca?: string;
  /** Only inject trusted transports: they receive API credentials. Caller owns close(). */
  transport?: Transport;
}
export type ResolvedOptions = Readonly<Required<Omit<ClientOptions, 'transport' | 'ca'>> & {ca?: string}>;
export interface RequestOptions { signal?: AbortSignal; }
export function resolveOptions(input: ClientOptions): ResolvedOptions {
  if (!isObject(input)) throw new ValidationError('Client options must be an object.');
  const allowed = ['timeoutMs','connectTimeoutMs','maxRetries','maxRetryDelayMs','maxResponseBytes','allowInsecureLocalhost','ca','transport'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new ValidationError('Unknown client option.');
  const options = {timeoutMs: 20_000, connectTimeoutMs: 5_000, maxRetries: 0, maxRetryDelayMs: 60_000,
    maxResponseBytes: 8_388_608, allowInsecureLocalhost: false, ...input};
  delete options.transport;
  for (const key of ['timeoutMs','connectTimeoutMs','maxRetries','maxRetryDelayMs','maxResponseBytes'] as const) {
    if (!Number.isSafeInteger(options[key])) throw new ValidationError('Timeouts, retries and limits must be whole numbers.');
  }
  if (!(options.connectTimeoutMs > 0 && options.connectTimeoutMs <= options.timeoutMs && options.timeoutMs <= 120_000)
      || options.maxRetries < 0 || options.maxRetries > 3 || options.maxRetryDelayMs < 0 || options.maxRetryDelayMs > 60_000
      || options.maxResponseBytes < 1024 || options.maxResponseBytes > 67_108_864)
    throw new ValidationError('Client timeout, retry or response limits are outside the supported bounds.');
  if (typeof options.allowInsecureLocalhost !== 'boolean' || (options.ca !== undefined && (typeof options.ca !== 'string' || !options.ca || options.ca.length > 1_048_576)))
    throw new ValidationError('Invalid localhost flag or trusted CA bundle.');
  if (input.transport !== undefined && (!input.transport || typeof input.transport.send !== 'function' || typeof input.transport.close !== 'function'))
    throw new ValidationError('A transport needs send() and close().');
  return Object.freeze(options);
}
