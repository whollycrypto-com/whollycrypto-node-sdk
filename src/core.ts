import {inspect} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {APIError, InvalidResponseError, RequestAbortedError, TransportError, ValidationError} from './errors.js';
import {HTTPTransport, type Transport} from './transport.js';
import {HTTPRequest, HTTPResponse} from './models.js';
import {decodeJSON, encodeBody, isObject} from './json.js';
import {resolveOptions, type ClientOptions, type RequestOptions, type ResolvedOptions} from './options.js';
import {origin, queryString, requestSignal} from './validation.js';
import type {Query} from './types.js';

export const VERSION = '2.0.0';
export class JSONClient {
  readonly #origin: string;
  readonly #token: string | undefined;
  readonly #transport: Transport;
  readonly #ownsTransport: boolean;
  readonly #options: ResolvedOptions;
  #closed = false;
  #lastResponse: HTTPResponse | null = null;
  constructor(baseURL: string, token: string | undefined, options: ClientOptions) {
    this.#options = resolveOptions(options); this.#origin = origin(baseURL, this.#options);
    if (token !== undefined && (typeof token !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(token)))
      throw new ValidationError('API token must be nonempty visible ASCII without spaces or newlines.');
    this.#token = token; this.#transport = options.transport ?? new HTTPTransport(); this.#ownsTransport = options.transport === undefined;
  }
  get lastResponse(): HTTPResponse | null { return this.#lastResponse; }
  close(): void { if (!this.#closed && this.#ownsTransport) this.#transport.close(); this.#closed = true; }
  [inspect.custom](): string { return `JSONClient(authenticated=${this.#token !== undefined}, closed=${this.#closed})`; }
  toJSON(): never { throw new TypeError('API clients containing credentials must not be serialized.'); }
  url(path: string, query?: Query): string {
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(path) || path.startsWith('//')) throw new ValidationError('Invalid relative API path.');
    const encoded = queryString(query);
    return this.#origin + path + (encoded ? '?' + encoded : '');
  }
  async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, params: {
    query?: Query; body?: unknown; idempotencyKey?: string; authenticated?: boolean; options?: RequestOptions;
  } = {}): Promise<T> {
    this.#lastResponse = null;
    if (this.#closed) throw new ValidationError('This client is closed; create a new client.');
    const signal = requestSignal(params.options ?? {});
    if (signal?.aborted) throw new RequestAbortedError();
    const headers: Record<string, string> = {Accept: 'application/json', 'User-Agent': 'WhollyCrypto-Node/' + VERSION};
    if (params.authenticated !== false) {
      if (!this.#token) throw new ValidationError('This operation requires a merchant API token.');
      headers.Authorization = 'Bearer ' + this.#token;
    }
    if (params.idempotencyKey !== undefined) {
      if (typeof params.idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(params.idempotencyKey))
        throw new ValidationError('Idempotency key must contain 1–128 visible ASCII characters without spaces.');
      headers['Idempotency-Key'] = params.idempotencyKey;
    }
    const body = method === 'GET' ? undefined : encodeBody(params.body);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const request = new HTTPRequest(method, this.url(path, params.query), headers, body);
    const retrySafe = method === 'GET' || (method === 'POST' && params.idempotencyKey !== undefined);
    for (let attempt = 0; ; attempt++) {
      this.#lastResponse = null;
      if (signal?.aborted) throw new RequestAbortedError();
      let response: HTTPResponse;
      try { response = await this.#transport.send(request, this.#options, signal); }
      catch (error) {
        if (!(error instanceof TransportError) || !error.retryable || !retrySafe || attempt >= this.#options.maxRetries) throw error;
        await this.pause(attempt, null, signal); continue;
      }
      if (!(response instanceof HTTPResponse)) throw new InvalidResponseError('Transport must return an HTTPResponse.');
      this.#lastResponse = response;
      if (response.bodyBytes > this.#options.maxResponseBytes) throw new InvalidResponseError('Response exceeded the configured size limit.');
      const wait = response.retryAfterSeconds();
      if (retrySafe && attempt < this.#options.maxRetries && [429,502,503,504].includes(response.statusCode)
          && (response.header('retry-after') === undefined || wait !== null) && (wait ?? 0) * 1000 <= this.#options.maxRetryDelayMs) {
        await this.pause(attempt, wait, signal); continue;
      }
      return this.decode<T>(response);
    }
  }
  private async pause(attempt: number, seconds: number | null, signal?: AbortSignal): Promise<void> {
    const ms = seconds === null ? Math.min(this.#options.maxRetryDelayMs, 250 * 2 ** attempt + Math.floor(Math.random() * 100)) : seconds * 1000;
    try { await delay(ms, undefined, {signal}); }
    catch { throw new RequestAbortedError(); }
  }
  private decode<T>(response: HTTPResponse): T {
    const status = response.statusCode;
    if (status >= 300 && status < 400) throw new APIError(response, 'redirect_not_followed', null);
    let data: Record<string, unknown> | null = null;
    const contentType = response.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (contentType === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType ?? '')) {
      try { const decoded = decodeJSON(response.body); if (isObject(decoded)) data = decoded; } catch { /* Never print a response body. */ }
    }
    if (status < 200 || status >= 300) {
      const serverCode = data?.error;
      const code = typeof serverCode === 'string' && /^[a-z0-9_]{1,80}$/.test(serverCode) && !(this.#token && serverCode.includes(this.#token)) ? serverCode : 'http_error';
      const message = typeof data?.message === 'string' ? data.message.slice(0,4096) : null;
      throw new APIError(response, code, message);
    }
    if (data === null) throw new InvalidResponseError('Expected a valid JSON object response. Check the API domain and proxy configuration.');
    return data as T;
  }
}
