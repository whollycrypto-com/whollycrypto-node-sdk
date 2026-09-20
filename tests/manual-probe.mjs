// Copied beside a manually extracted SDK, outside this repository/node_modules.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import * as sdk from './whollycrypto-node-sdk/dist/index.mjs';

const cjs = createRequire(import.meta.url)('./whollycrypto-node-sdk/dist/index.js');
assert.equal(sdk.VERSION, '2.5.0');
for (const name of Object.keys(sdk)) assert.equal(sdk[name], cjs[name]);
const project = '11111111-1111-4111-8111-111111111111';
const store = '22222222-2222-4222-8222-222222222222';
const invoice = '33333333-3333-4333-8333-333333333333';
const token = 'wc_fixture_not_a_real_credential';
const amount = '0.123456789012345678901234567890';
const transport = {
  close() {},
  async send(request) {
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    assert.equal(request.headers['Idempotency-Key'], 'saved-manual-fixture-key');
    assert.equal(request.body.toString(), JSON.stringify({amount, currency: 'EUR'}));
    return new sdk.HTTPResponse(200, {'content-type': 'application/json'}, Buffer.from(JSON.stringify({
      data: {invoice_id: invoice, amount}, links: {checkout: 'https://pay.example.test/invoice/' + invoice},
    })));
  },
};
for (const Client of [sdk.Client, cjs.Client]) {
  const client = new Client('https://api.example.test', token, {transport});
  try {
    const result = await client.createInvoice(project, store, {currency: 'EUR', amount}, 'saved-manual-fixture-key');
    assert.equal(result.data.invoice_id, invoice);
    assert.equal(result.data.amount, amount);
  } finally { client.close(); }
}

const raw = Buffer.from(JSON.stringify({invoice_id: invoice, sequence: 1, status: 'settled'}));
const now = 1800000000;
const secret = 'isolated-manual-sdk-signature-fixture';
const signature = 't=' + now + ',v1=' + createHmac('sha256', secret).update(String(now) + '.').update(raw).digest('hex');
const headers = {'Wholly-Signature': signature, 'Wholly-Event-Id': project, 'Wholly-Delivery-Id': store};
assert.equal(sdk.parseNotification(raw, headers, secret, {now}).invoiceId, invoice);
assert.throws(() => cjs.parseNotification(raw, headers, 'incorrect', {now}), sdk.InvalidSignatureError);
console.log('PASS: manual ESM/CommonJS clients, exact invoice bytes and webhook signatures; no npm or live requests.');
