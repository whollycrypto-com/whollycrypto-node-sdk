import {isIP} from 'node:net';
import {ValidationError} from './errors.js';
import {isObject} from './json.js';
import type {Query} from './types.js';
import type {ResolvedOptions, RequestOptions} from './options.js';

export function origin(input: unknown, options: ResolvedOptions): string {
  if (typeof input !== 'string' || /[\s\x00-\x1f\x7f\\?#]/.test(input) || !/^https?:\/\//.test(input))
    throw new ValidationError('Use an absolute HTTPS origin without /v1, credentials, query or fragment.');
  try {
    const url = new URL(input);
    const authority = input.slice(input.indexOf('://') + 3).split('/')[0]!;
    if (url.username || url.password || authority.includes('@') || /:\s*$/.test(authority) || url.pathname !== '/' || (url.port && Number(url.port) < 1)) throw Error();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host || host.length > 253 || (!isIP(host) && !host.replace(/\.$/, '').split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) throw Error();
    if (url.protocol !== 'https:' && !(options.allowInsecureLocalhost && url.protocol === 'http:' && ['localhost','127.0.0.1','::1'].includes(host))) throw Error();
    // WHATWG URL normalizes legacy IPv4 and dot paths: don't silently broaden loopback opt-in.
    if (url.protocol === 'http:' && !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/i.test(authority)) throw Error();
    const suffix = input.slice(input.indexOf('://') + 3 + authority.length);
    if (suffix !== '' && suffix !== '/') throw Error();
    return url.origin;
  } catch { throw new ValidationError('Use an HTTPS origin without credentials or a path. HTTP requires explicit loopback test permission.'); }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
    throw new ValidationError('Expected an API UUID, not a readable project/store identifier or order ID.');
  return value.toLowerCase();
}
export function decimal(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^[0-9]{1,48}(?:\.[0-9]{1,30})?$/.test(value))
    throw new ValidationError(`${name} must be an unsigned plain decimal string, never a JavaScript number.`);
  return value;
}
export function queryString(query: Query | undefined): string {
  if (query === undefined) return '';
  if (!isObject(query)) throw new ValidationError('Query parameters must be an object.');
  const pairs: string[] = [];
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  try {
    for (const [key, value] of Object.entries(query)) {
      if (!/^[a-z_]+$/.test(key)) throw Error();
      if (value === undefined || value === null) continue;
      if (!['string','boolean','number'].includes(typeof value) || (typeof value === 'number' && !Number.isSafeInteger(value))) throw Error();
      pairs.push(encode(key) + '=' + encode(String(value)));
    }
  } catch { throw new ValidationError('Query values must be strings, safe integers, booleans, null or undefined.'); }
  return pairs.join('&');
}
export function requestSignal(options: RequestOptions): AbortSignal | undefined {
  if (!isObject(options) || Object.keys(options).some(key => key !== 'signal')
      || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw new ValidationError('Request options only accept an AbortSignal.');
  return options.signal;
}
