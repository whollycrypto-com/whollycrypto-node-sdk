import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspect} from 'node:util';
import {createRequire} from 'node:module';
import DefaultClient,{Client,CheckoutClient,HTTPResponse,HTTPRequest,APIError,InvalidResponseError,TransportError,ValidationError,RequestAbortedError,VERSION} from 'whollycrypto';
import {PROJECT,STORE,INVOICE,ASSET,TOKEN,FakeTransport,reply,invoke} from './helpers.mjs';
const make=(transport,options={})=>new Client('https://api.example.test',TOKEN,{transport,...options});
const fixture=JSON.parse(await readFile(new URL('./fixtures/api-v1.json',import.meta.url),'utf8'));

test('ESM and CommonJS use the same classes and version',()=>{
  const sdk=createRequire(import.meta.url)('whollycrypto');
  assert.equal(VERSION,'2.4.0');assert.equal(DefaultClient,Client);assert.equal(sdk.Client,Client);
  assert.equal(sdk.APIError,APIError);assert.equal(sdk.default,Client);
});
test('all 18 merchant endpoints match public fixtures and authorization',async t=>{
  assert.equal(fixture.endpoints.length,18);
  for(const endpoint of fixture.endpoints)await t.test(endpoint.id,async()=>{
    const transport=new FakeTransport(reply(endpoint.response)),client=make(transport);
    const result=await invoke(client,endpoint.id,structuredClone(endpoint.body));
    assert.deepEqual(result,endpoint.response);
    const request=transport.requests[0];
    const expected=endpoint.path.replace('{project_id}',PROJECT).replace('{store_id}',STORE).replace('{invoice_id}',INVOICE).replace('{asset_id}',ASSET);
    assert.equal(request.method,endpoint.method);assert.equal(new URL(request.url).pathname,expected);
    assert.equal(request.headers.Authorization,endpoint.access==='public'?undefined:'Bearer '+TOKEN);
    if(endpoint.body===null)assert.equal(request.body,undefined);
    else assert.deepEqual(JSON.parse(request.body.toString()),endpoint.body);
    assert.equal(request.headers['Idempotency-Key'],endpoint.id==='create-invoice'?'saved-order-1042':undefined);
  });
});
test('amounts, canonical wire bytes and request snapshots stay exact',async()=>{
  const transport=new FakeTransport(reply()),client=make(transport);
  const payload={currency:'EUR',amount:'0.123456789012345678901234567890',metadata:{z:[],a:{}}};
  await client.createInvoice(PROJECT,STORE,payload,'saved');
  const request=transport.requests[0];
  assert.equal(request.body.toString(),'{"amount":"0.123456789012345678901234567890","currency":"EUR","metadata":{"a":{},"z":[]}}');
  const copy=request.body;copy.fill(0);assert.notEqual(request.body[0],0);
  assert.throws(()=>{request.headers.Authorization='changed';},TypeError);
  assert.equal(payload.amount,'0.123456789012345678901234567890');
});
test('unsafe integers and fractional response literals retain their exact value',async()=>{
  const response=new HTTPResponse(200,{'content-type':'application/json'},Buffer.from('{"data":{"atomic":999999999999999999999999,"rate":0.1234567890123456789,"exponent":1e-30,"count":7,"amount":"0.000000000000000001"}}'));
  const result=await make(new FakeTransport(response)).health();
  assert.deepEqual(result.data,{atomic:'999999999999999999999999',rate:'0.1234567890123456789',exponent:'1e-30',count:7,amount:'0.000000000000000001'});
});
test('opt-in retries reuse the exact invoice request and credential',async()=>{
  const transport=new FakeTransport(new TransportError('test',true),reply({},503,{'retry-after':'0'}),reply({data:{invoice_id:INVOICE}}));
  const client=make(transport,{maxRetries:2,maxRetryDelayMs:0});
  await client.createInvoice(PROJECT,STORE,{amount:'10.00'},'persisted');
  assert.equal(transport.requests.length,3);
  assert.ok(transport.requests.every(request=>request===transport.requests[0]));
  assert.equal(transport.requests[0].headers['Idempotency-Key'],'persisted');
});
test('writes without idempotency, disabled retries and certificate errors never replay',async()=>{
  for(const call of [c=>c.registerTokenAsset(PROJECT,{chain_slug:'ethereum',coingecko_id:'usd-coin'}),c=>c.updateStorePaymentAssets(PROJECT,STORE,[])]){
    const transport=new FakeTransport(reply({},503));await assert.rejects(call(make(transport,{maxRetries:3})),APIError);
    assert.equal(transport.requests.length,1);
  }
  for(const [options,error] of [[{},new TransportError('temporary',true)],[{maxRetries:3},new TransportError('TLS',false)]]){
    const transport=new FakeTransport(error);await assert.rejects(make(transport,options).health(),TransportError);assert.equal(transport.requests.length,1);
  }
});
test('invalid or excessive Retry-After is surfaced, never shortened',async()=>{
  for(const retry of ['tomorrow','9','Sun, 13 Sep 2037 00:00:00 GMT']){
    const transport=new FakeTransport(reply({error:'rate_limited'},429,{'retry-after':retry}));
    await assert.rejects(make(transport,{maxRetries:3,maxRetryDelayMs:1000}).health(),e=>e instanceof APIError&&e.statusCode===429);
    assert.equal(transport.requests.length,1);
  }
});
test('abort before send and during backoff never retries',async()=>{
  const controller=new AbortController();controller.abort(TOKEN);
  const empty=new FakeTransport();await assert.rejects(make(empty).health({signal:controller.signal}),RequestAbortedError);assert.equal(empty.requests.length,0);
  const next=new AbortController(),transport=new FakeTransport(reply({},429,{'retry-after':'1'}));
  const pending=make(transport,{maxRetries:2}).health({signal:next.signal});setTimeout(()=>next.abort(TOKEN),15);
  await assert.rejects(pending,e=>e instanceof RequestAbortedError&&!String(e).includes(TOKEN));assert.equal(transport.requests.length,1);
});
test('private response details do not leak through errors or client inspection',async()=>{
  const transport=new FakeTransport(reply({error:TOKEN,message:'private customer '+TOKEN},400));
  const client=make(transport);
  await assert.rejects(client.health(),error=>{
    assert.equal(error.errorCode,'http_error');assert.match(error.apiMessage,/private customer/);
    for(const value of [String(error),inspect(error,{showHidden:true}),JSON.stringify(error),inspect(client,{showHidden:true}),inspect(error.response),JSON.stringify(error.response)])assert.ok(!value.includes(TOKEN));
    return true;
  });
  const request=new HTTPRequest('POST','https://api.example.test/',{Authorization:TOKEN},Buffer.from(TOKEN));
  assert.ok(!inspect(request,{showHidden:true}).includes(TOKEN));assert.throws(()=>JSON.stringify(request),TypeError);assert.throws(()=>JSON.stringify(client),TypeError);
});
test('payment readiness errors are actionable without leaking remote text',()=>{
  const issue={chain_slug:'tron',asset_ticker:TOKEN,reason_code:'scanner_provider_quorum',usable_independent_providers:1,message:TOKEN};
  const error=new APIError(reply({error:{details:{payment_methods:[issue,issue]}}},400),'invalid_payment_request',TOKEN);
  assert.match(error.message,/TRON: 1 of 2 independent scanner providers/);
  assert.equal(error.message.split('TRON:').length,2);
  assert.deepEqual(error.paymentMethodIssues,[issue,issue]);
  for(const view of [String(error),inspect(error,{showHidden:true}),JSON.stringify(error)])assert.ok(!view.includes(TOKEN));
  for(const issues of [null,1,'bad',[{reason_code:[]}],[{chain_slug:TOKEN,reason_code:'rate_unavailable',message:TOKEN}],[{chain_slug:'tron',reason_code:'scanner_provider_quorum',usable_independent_providers:TOKEN}]]){
    const e=new APIError(reply({error:{details:{payment_methods:issues}}},400),'invalid_payment_request',TOKEN);assert.ok(!e.message.includes(TOKEN));
  }
  assert.deepEqual(new APIError(new HTTPResponse(400,{},Buffer.from('not JSON')),'http_error',null).details,{});
});
test('redirects, invalid JSON and malformed envelopes fail safely',async()=>{
  for(const text of ['[]','{"x":1,"x":2}','{"__proto__":1,"__proto__":2}','{"x":NaN}','{"x":Infinity}','{"x":01}','{"x":1,}','{"x":"\\ud800"}', '{"x":'+ '['.repeat(34)+'0'+']'.repeat(34)+'}']){
    const transport=new FakeTransport(new HTTPResponse(200,{'content-type':'application/json'},Buffer.from(text)));
    await assert.rejects(make(transport).health(),InvalidResponseError);
  }
  await assert.rejects(make(new FakeTransport(new HTTPResponse(302,{location:'https://untrusted.test'},Buffer.alloc(0)))).health(),e=>e.errorCode==='redirect_not_followed');
  await assert.rejects(make(new FakeTransport(new HTTPResponse(200,{'content-type':'text/html'},Buffer.from('login')))).health(),InvalidResponseError);
  const result=await make(new FakeTransport(new HTTPResponse(200,{'content-type':'application/json'},Buffer.from('{"__proto__":{"polluted":true}}')))).health();
  assert.equal(Object.getPrototypeOf(result),Object.prototype);assert.equal({}.polluted,undefined);assert.equal(result.__proto__.polluted,true);
});
test('invoice iteration is lazy, bounded and rejects stalled pagination',async()=>{
  const transport=new FakeTransport(reply({data:[{invoice_id:INVOICE}],pagination:{limit:1,offset:0,has_more:true}}),reply({data:[{invoice_id:STORE}],pagination:{limit:1,offset:1,has_more:false}}));
  const iterator=make(transport).iterateInvoices(PROJECT,{limit:1});assert.equal(transport.requests.length,0);
  assert.equal((await iterator.next()).value.invoice_id,INVOICE);assert.equal(transport.requests.length,1);
  assert.equal((await iterator.next()).value.invoice_id,STORE);assert.equal(transport.requests.length,2);assert.equal((await iterator.next()).done,true);
  for(const page of [{data:[],pagination:{limit:50,offset:0,has_more:true}},{data:[],pagination:{limit:50,offset:1,has_more:false}}]){
    const it=make(new FakeTransport(reply(page))).iterateInvoices(PROJECT);await assert.rejects(it.next(),InvalidResponseError);
  }
});
test('public checkout has no bearer token and preserves Lightning fields',async()=>{
  const transport=new FakeTransport(reply({payment_rail:'lightning',asset_decimals:11,payment_uri:'lightning:lnbc-fixture'}),reply());
  const checkout=new CheckoutClient('https://pay.example.test',{transport});
  const result=await checkout.getInvoice(INVOICE);assert.equal(result.asset_decimals,11);
  await checkout.getPreview(PROJECT,STORE);
  assert.equal(checkout.invoiceURL(INVOICE),'https://pay.example.test/invoice/'+INVOICE);
  assert.equal(new URL(checkout.previewURL(PROJECT,STORE,'paid')).searchParams.get('state'),'paid');
  assert.ok(transport.requests.every(r=>!r.headers.Authorization));
  assert.throws(()=>checkout.previewURL(PROJECT,STORE,'settled'),ValidationError);
});
test('empty selection clears on-chain assets and custom transports remain caller owned',async()=>{
  const transport=new FakeTransport(reply(),new TransportError('offline')),client=make(transport);
  await client.updateStorePaymentAssets(PROJECT,STORE,[]);assert.equal(transport.requests[0].body.toString(),'{"assets":[]}');
  assert.equal(client.lastResponse.statusCode,200);await assert.rejects(client.health(),TransportError);assert.equal(client.lastResponse,null);
  client.close();assert.equal(transport.closed,false);await assert.rejects(client.health(),ValidationError);
});
