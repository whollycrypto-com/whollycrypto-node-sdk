import {ValidationError} from './errors.js';
import type {JsonObject, JsonValue} from './types.js';

export function isObject<T>(value: T): value is T & Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function unicode(value: string): boolean { return Buffer.from(value, 'utf8').toString('utf8') === value; }

/** Stable object-key ordering. Never silently invoke toJSON(), drop undefined, or round money. */
export function encodeBody(value: unknown): Buffer {
  if (!isObject(value)) throw new ValidationError('Write requests need a JSON object.');
  function encode(item: unknown, depth: number): string {
    if (depth > 32) throw new ValidationError('JSON nesting exceeds 32 levels.');
    if (item === null) return 'null';
    if (typeof item === 'string' && unicode(item)) return JSON.stringify(item);
    if (typeof item === 'boolean') return String(item);
    if (typeof item === 'number' && Number.isFinite(item) && (!Number.isInteger(item) || Number.isSafeInteger(item))) return JSON.stringify(item);
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length || Object.getOwnPropertySymbols(item).length) throw new ValidationError('Use dense JSON lists without extra properties.');
      const values: string[] = [];
      for (let index = 0; index < item.length; index++) {
        const property = Object.getOwnPropertyDescriptor(item, String(index));
        if (!property || !Object.hasOwn(property, 'value')) throw new ValidationError('Use plain JSON values, not accessors.');
        values.push(encode(property.value, depth + 1));
      }
      return '[' + values.join(',') + ']';
    }
    if (isObject(item)) {
      if (Object.getOwnPropertySymbols(item).length) throw new ValidationError('JSON objects cannot have symbol keys.');
      return '{' + Object.keys(item).sort().map(key => {
        if (!unicode(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(item, key)!, 'value')) throw new ValidationError('Use plain JSON values, not accessors.');
        return JSON.stringify(key) + ':' + encode(item[key], depth + 1);
      }).join(',') + '}';
    }
    throw new ValidationError('Use JSON values; undefined, bigint, unsafe integers and custom objects are not supported.');
  }
  const body = Buffer.from(encode(value, 0), 'utf8');
  if (body.length > 32_768) throw new ValidationError('Merchant JSON body exceeds the 32 KiB limit.');
  return body;
}

/** Strict, bounded JSON: keep unsafe integer/fractional numeric literals as exact strings. */
export function decodeJSON(body: Uint8Array): JsonValue {
  const text = new TextDecoder('utf-8', {fatal: true}).decode(body);
  let at = 0;
  const fail = (): never => { throw new SyntaxError('Invalid, ambiguous or excessive JSON.'); };
  const space = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at]!)) at++; };
  function string(): string {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === '\\') { at++; continue; }
      if (char === '"') {
        const result: unknown = JSON.parse(text.slice(start, at));
        if (typeof result !== 'string' || !unicode(result)) fail();
        return result as string;
      }
    }
    return fail();
  }
  function value(depth: number): JsonValue {
    if (depth > 32) fail();
    space(); const char = text[at];
    if (char === '"') return string();
    if (char === '{') {
      at++; space(); const object: JsonObject = {}; const keys = new Set<string>();
      if (text[at] === '}') { at++; return object; }
      for (;;) {
        space(); if (text[at] !== '"') fail();
        const key = string(); if (keys.has(key)) fail(); keys.add(key);
        space(); if (text[at++] !== ':') fail();
        Object.defineProperty(object, key, {value: value(depth + 1), enumerable: true, writable: true, configurable: true});
        space(); const end = text[at++];
        if (end === '}') return object;
        if (end !== ',') fail();
      }
    }
    if (char === '[') {
      at++; space(); const list: JsonValue[] = [];
      if (text[at] === ']') { at++; return list; }
      for (;;) {
        list.push(value(depth + 1)); space(); const end = text[at++];
        if (end === ']') return list;
        if (end !== ',') fail();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
    if (!match) return fail();
    const raw = match[0]; at += raw.length;
    // No binary floating-point conversion for fractional/exponent literals.
    if (/[.eE]/.test(raw) || !Number.isSafeInteger(Number(raw))) return raw;
    return Number(raw);
  }
  const result = value(0); space(); if (at !== text.length) fail(); return result;
}
