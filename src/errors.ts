import {inspect} from 'node:util';
import type {HTTPResponse} from './models.js';

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
    super(`Wholly Crypto API returned HTTP ${response.statusCode} (${errorCode}).`);
    this.statusCode = response.statusCode; this.errorCode = errorCode;
    this.#response = response; this.#apiMessage = apiMessage;
  }
  /** Private diagnostics: may contain customer data. Never log response bodies by default. */
  get response(): HTTPResponse { return this.#response; }
  get apiMessage(): string | null { return this.#apiMessage; }
  get retryAfterSeconds(): number | null { return this.#response.retryAfterSeconds(); }
}
