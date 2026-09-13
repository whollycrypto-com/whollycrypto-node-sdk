import * as http from 'node:http';
import * as https from 'node:https';
import {inspect} from 'node:util';
import {HTTPResponse, type HTTPRequest} from './models.js';
import {RequestAbortedError, TransportError} from './errors.js';
import {origin} from './validation.js';
import type {ResolvedOptions} from './options.js';

export interface Transport {
  send(request: HTTPRequest, options: ResolvedOptions, signal?: AbortSignal): Promise<HTTPResponse>;
  close(): void;
}
/** Direct Node HTTP(S), with TLS verification, no redirects or implicit proxy/cookie credentials. */
export class HTTPTransport implements Transport {
  readonly #http = new http.Agent({keepAlive: true, maxSockets: 8, maxFreeSockets: 2, timeout: 30_000});
  readonly #https = new https.Agent({keepAlive: true, maxSockets: 8, maxFreeSockets: 2, timeout: 30_000});
  #closed = false;
  close(): void { this.#closed = true; this.#http.destroy(); this.#https.destroy(); }
  [inspect.custom](): string { return 'HTTPTransport()'; }
  toJSON(): never { throw new TypeError('HTTP transports must not be serialized.'); }
  async send(request: HTTPRequest, options: ResolvedOptions, signal?: AbortSignal): Promise<HTTPResponse> {
    if (this.#closed) throw new TransportError('HTTP transport is closed.');
    if (signal?.aborted) throw new RequestAbortedError();
    const url = new URL(request.url);
    origin(url.origin, options);
    if (url.username || url.password || url.hash) throw new TransportError('Invalid request URL.');
    return new Promise<HTTPResponse>((resolve, reject) => {
      let settled = false, timer: NodeJS.Timeout | undefined, connectTimer: NodeJS.Timeout | undefined;
      let req: http.ClientRequest | undefined;
      const cleanup = () => { clearTimeout(timer); clearTimeout(connectTimer); signal?.removeEventListener('abort', abort); };
      const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); req?.destroy(); reject(error); };
      const abort = () => fail(new RequestAbortedError());
      signal?.addEventListener('abort', abort, {once: true});
      timer = setTimeout(() => fail(new TransportError('Wholly Crypto request timed out. A write may have succeeded.', true)), options.timeoutMs);
      const headers = {...request.headers};
      const body = request.body;
      if (body !== undefined) headers['Content-Length'] = String(body.length);
      try {
        const sender = url.protocol === 'https:' ? https : http;
        req = sender.request(url, {method: request.method, headers, agent: url.protocol === 'https:' ? this.#https : this.#http,
          maxHeaderSize: 32_768, insecureHTTPParser: false, rejectUnauthorized: true, ca: options.ca}, res => {
          clearTimeout(connectTimer);
          const responseHeaders: Record<string, string> = {};
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const key = res.rawHeaders[i]!.toLowerCase(), value = res.rawHeaders[i + 1]!;
            if (Object.hasOwn(responseHeaders, key) && ['content-length','content-type','transfer-encoding','retry-after'].includes(key)) {
              fail(new TransportError('Response contains ambiguous framing or retry headers.')); res.destroy(); return;
            }
            Object.defineProperty(responseHeaders, key, {value, enumerable: true, configurable: true});
          }
          const length = responseHeaders['content-length'], transfer = responseHeaders['transfer-encoding'];
          if ((length !== undefined && (!/^[0-9]{1,20}$/.test(length) || Number(length) > options.maxResponseBytes || transfer !== undefined))
              || (transfer !== undefined && transfer.toLowerCase() !== 'chunked')) {
            fail(new TransportError('Response framing is invalid or exceeds the configured size limit.')); res.destroy(); return;
          }
          let size = 0; const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > options.maxResponseBytes) { fail(new TransportError('Response exceeded the configured size limit.')); res.destroy(); }
            else chunks.push(chunk);
          });
          res.on('error', () => fail(new TransportError('Response stream could not finish.', true)));
          res.on('aborted', () => fail(new TransportError('HTTP response ended early.', true)));
          res.on('end', () => {
            if (settled) return;
            if (!res.complete || (length !== undefined && Number(length) !== size)) { fail(new TransportError('HTTP response ended early.', true)); return; }
            try {
              const response = new HTTPResponse(res.statusCode!, responseHeaders, Buffer.concat(chunks));
              settled = true; cleanup(); resolve(response);
            } catch { fail(new TransportError('Invalid HTTP response.')); }
          });
        });
        req.on('socket', socket => {
          if (socket.connecting) {
            connectTimer = setTimeout(() => fail(new TransportError('Wholly Crypto connection timed out.', true)), options.connectTimeoutMs);
            socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
          }
        });
        req.on('error', (error: NodeJS.ErrnoException) => {
          const retryable = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','EPIPE'].includes(error.code || '');
          fail(new TransportError('Wholly Crypto HTTPS connection failed. Check DNS, certificates and connectivity.', retryable));
        });
        if (signal?.aborted) abort();
        else req.end(body);
      } catch { fail(new TransportError('HTTP request could not be initialized.')); }
    });
  }
}
