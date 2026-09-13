import {inspect} from 'node:util';
import {ValidationError} from './errors.js';

export class HTTPRequest {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly url: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #body: Buffer | undefined;
  constructor(method: 'GET' | 'POST' | 'PUT', url: string, headers: Readonly<Record<string, string>>, body?: Uint8Array) {
    this.method = method; this.url = url; this.#headers = Object.freeze({...headers});
    this.#body = body === undefined ? undefined : Buffer.from(body);
    Object.freeze(this);
  }
  get headers(): Readonly<Record<string, string>> { return this.#headers; }
  /** Returns a copy so a custom transport cannot modify bytes used by a later retry. */
  get body(): Buffer | undefined { return this.#body === undefined ? undefined : Buffer.from(this.#body); }
  [inspect.custom](): string { return `HTTPRequest(${this.method}, bodyBytes=${this.#body?.length || 0})`; }
  toJSON(): never { throw new TypeError('Requests containing credentials must not be serialized.'); }
}

export class HTTPResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly #body: Buffer;
  constructor(statusCode: number, headers: Readonly<Record<string, string>>, body: Uint8Array) {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599 || !(body instanceof Uint8Array)) throw new ValidationError('Invalid HTTP response.');
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string' || Object.hasOwn(normalized, key.toLowerCase())) throw new ValidationError('Invalid or duplicate response header.');
      Object.defineProperty(normalized, key.toLowerCase(), {value, enumerable: true});
    }
    this.statusCode = statusCode; this.headers = Object.freeze(normalized); this.#body = Buffer.from(body);
    Object.freeze(this);
  }
  get body(): Buffer { return Buffer.from(this.#body); }
  get bodyBytes(): number { return this.#body.length; }
  header(name: string): string | undefined { return this.headers[name.toLowerCase()]; }
  retryAfterSeconds(nowMs = Date.now()): number | null {
    const value = this.header('retry-after');
    if (value === undefined) return null;
    if (/^[0-9]{1,9}$/.test(value)) return Number(value);
    if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toUTCString() === value ? Math.max(0, Math.ceil((date.getTime() - nowMs) / 1000)) : null;
  }
  rateLimit(): Readonly<{limit: number | null; remaining: number | null; reset: number | null}> {
    const read = (key: string) => { const value = this.header('x-ratelimit-' + key); return value !== undefined && /^[0-9]{1,10}$/.test(value) ? Number(value) : null; };
    return Object.freeze({limit: read('limit'), remaining: read('remaining'), reset: read('reset')});
  }
  [inspect.custom](): string { return `HTTPResponse(statusCode=${this.statusCode}, bodyBytes=${this.#body.length})`; }
  toJSON(): {statusCode: number; bodyBytes: number} { return {statusCode: this.statusCode, bodyBytes: this.#body.length}; }
}
