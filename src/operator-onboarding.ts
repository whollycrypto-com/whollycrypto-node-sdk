import {JSONClient} from './core.js';
import type {ClientOptions, RequestOptions} from './options.js';
import type {APIObject} from './types.js';

/** Invitation-token-only API; no Operator or merchant key is accepted or sent. */
export class OperatorOnboardingClient {
  readonly #http: JSONClient;
  constructor(apiBaseURL: string, options: ClientOptions = {}) { this.#http = new JSONClient(apiBaseURL, undefined, options); }
  close(): void { this.#http.close(); }
  checkInvitation(token: string, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('POST', '/v1/onboarding/invitations/check', {body:{token},authenticated:false,options});
  }
  /** No automatic retry/login. If the response is lost, inspect the link and try signing in. */
  acceptInvitation(token: string, password: string, custodyAcknowledged: boolean, options?: RequestOptions): Promise<APIObject> {
    return this.#http.request('POST', '/v1/onboarding/invitations/accept', {body:{token,password,custody_acknowledged:custodyAcknowledged},authenticated:false,options});
  }
}
