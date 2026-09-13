import {createHmac, timingSafeEqual} from 'node:crypto';
import {inspect} from 'node:util';
import {decodeJSON, isObject} from './json.js';
import {uuid} from './validation.js';
import {InvalidSignatureError, ValidationError} from './errors.js';
import type {InvoiceStatus, JsonValue} from './types.js';

export interface SignatureOptions { toleranceSeconds?: number; now?: number; }
export type SigningSecret = string | Uint8Array;
export type NotificationHeaders = Readonly<Record<string, string | string[] | undefined>> | readonly string[] | Iterable<readonly [string, string]>;
export type ReadonlyJSON = null | boolean | number | string | {readonly [key: string]: ReadonlyJSON} | readonly ReadonlyJSON[];
export interface NotificationPayload {readonly [key: string]: ReadonlyJSON; readonly invoice_id: string; readonly sequence: number | string; readonly status: InvoiceStatus; }
const MAX_BODY = 262_144;
function signatureValid(raw: Buffer, signature: unknown, secret: SigningSecret, options: SignatureOptions): boolean {
  if (!isObject(options) || Object.keys(options).some(key => !['toleranceSeconds','now'].includes(key))) throw new ValidationError('Invalid signature options.');
  const now = options.now ?? Math.floor(Date.now() / 1000), tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 86_400) throw new ValidationError('Invalid signature clock or tolerance.');
  if ((typeof secret !== 'string' && !(secret instanceof Uint8Array)) || !secret.length) throw new ValidationError('Configure the IPN/webhook signing secret, not an API token.');
  if (typeof secret === 'string' && Buffer.from(secret).toString('utf8') !== secret) throw new ValidationError('Signing secret contains invalid Unicode.');
  if (raw.length > MAX_BODY || typeof signature !== 'string') return false;
  const match = /^t=(0|[1-9][0-9]{0,11}),v1=([a-f0-9]{64})$/.exec(signature);
  if (!match || Math.abs(now - Number(match[1])) > tolerance) return false;
  const expected = createHmac('sha256', secret).update(match[1]! + '.').update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(match[2]!, 'hex'));
}
export function verifySignature(rawBody: Uint8Array, signature: string | undefined, secret: SigningSecret, options: SignatureOptions = {}): boolean {
  if (!(rawBody instanceof Uint8Array)) throw new ValidationError('Pass exact raw HTTP body bytes before JSON parsing.');
  if (rawBody.byteLength > MAX_BODY) return signatureValid(Buffer.alloc(MAX_BODY + 1), signature, secret, options);
  return signatureValid(Buffer.from(rawBody), signature, secret, options);
}
function freeze(value: JsonValue): ReadonlyJSON {
  if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export class Notification {
  readonly eventId: string; readonly deliveryId: string;
  readonly #payload: NotificationPayload;
  constructor(eventId: string, deliveryId: string, payload: NotificationPayload) {
    this.eventId = eventId; this.deliveryId = deliveryId; this.#payload = payload; Object.freeze(this);
  }
  get payload(): NotificationPayload { return this.#payload; }
  get invoiceId(): string { return this.#payload.invoice_id; }
  get status(): InvoiceStatus { return this.#payload.status; }
  /** Exact decimal sequence string, including values larger than JavaScript's safe integer range. */
  get sequence(): string { return String(this.#payload.sequence); }
  [inspect.custom](): string { return 'Notification()'; }
  toJSON(): never { throw new TypeError('Notifications contain private customer data. Serialize only intentional fields.'); }
}

export function parseNotification(rawBody: Uint8Array, headers: NotificationHeaders, secret: SigningSecret, options: SignatureOptions = {}): Notification {
  if (!(rawBody instanceof Uint8Array)) throw new ValidationError('Pass exact raw HTTP body bytes before JSON parsing.');
  if (rawBody.byteLength > MAX_BODY) throw new InvalidSignatureError('Notification body is too large.');
  const raw = Buffer.from(rawBody), normalized: Record<string, string> = {};
  try {
    let pairs: Iterable<readonly [string, string | string[] | undefined]>;
    if (Array.isArray(headers) && typeof headers[0] === 'string') {
      if (headers.length % 2 || headers.length > 256) throw Error();
      pairs = Array.from({length: headers.length / 2}, (_, i) => [headers[i * 2], headers[i * 2 + 1]] as [string, string]);
    } else if (isObject(headers)) pairs = Object.entries(headers) as [string, string | string[] | undefined][];
    else pairs = headers as Iterable<readonly [string, string]>;
    let count = 0;
    for (const pair of pairs) {
      if (++count > 128 || !Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw Error();
      const name = pair[0].toLowerCase(), val: unknown = pair[1];
      if (['wholly-signature','wholly-event-id','wholly-delivery-id'].includes(name)) {
        if (typeof val !== 'string' || Object.hasOwn(normalized, name)) throw Error();
        normalized[name] = val;
      }
    }
  } catch { throw new InvalidSignatureError('Invalid or duplicate notification security headers.'); }
  if (!signatureValid(raw, normalized['wholly-signature'], secret, options)) throw new InvalidSignatureError('Invalid or expired notification signature.');
  try {
    const payload = decodeJSON(raw), eventId = uuid(normalized['wholly-event-id']), deliveryId = uuid(normalized['wholly-delivery-id']);
    if (!isObject(payload) || typeof payload.status !== 'string' || !['new','processing','settled','expired','invalid','cancelled'].includes(payload.status)) throw Error();
    uuid(payload.invoice_id);
    if ((typeof payload.sequence !== 'number' && typeof payload.sequence !== 'string') || !/^[1-9][0-9]{0,18}$/.test(String(payload.sequence))
        || BigInt(payload.sequence) > 9_223_372_036_854_775_807n) throw Error();
    return new Notification(eventId, deliveryId, freeze(payload as JsonValue) as NotificationPayload);
  } catch { throw new InvalidSignatureError('Signed notification has invalid identifiers or payload.'); }
}
