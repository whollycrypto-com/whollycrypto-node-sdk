import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,HTTPResponse,ValidationError} from 'whollycrypto';
import {FakeTransport,PROJECT,STORE,TOKEN,reply} from './helpers.mjs';

test('HTTPS origin validation rejects credentials, paths, controls and normalized loopback aliases',()=>{
  for(const url of ['http://example.test','https://user:pass@example.test','https://@example.test','https://api.example.test/v1','https://api.example.test/..','https://api.example.test?','https://api.example.test#','https://api.example.test\\','https://api.example.test:0','https://api.example.test:','https://api.example.test:99999','https://api.example.test\n','https://-bad.test','http://127.1','http://0x7f000001','http://127.0.0.2'])
    assert.throws(()=>new Client(url,TOKEN,{allowInsecureLocalhost:true}),ValidationError,url);
  for(const url of ['https://api.example.test','https://api.example.test:8443/','http://localhost:4555','http://127.0.0.1:4555','http://[::1]:4555'])new Client(url,TOKEN,{allowInsecureLocalhost:true}).close();
});
test('credentials and client options are validated',()=>{
  for(const token of ['',null,undefined,'has space','x\r\nHeader: x','☃','x'.repeat(4097)])assert.throws(()=>new Client('https://api.example.test',token),ValidationError);
  for(const options of [{timeoutMs:0},{timeoutMs:NaN},{timeoutMs:Infinity},{connectTimeoutMs:20001},{maxRetries:4},{maxRetries:0.5},{maxResponseBytes:0},{allowInsecureLocalhost:1},{rejectUnauthorized:false},{ca:''},{transport:{}},null,[]])assert.throws(()=>new Client('https://api.example.test',TOKEN,options),ValidationError);
  assert.notEqual(Client.newIdempotencyKey(),Client.newIdempotencyKey());assert.match(Client.newIdempotencyKey(),/^[a-f0-9]{48}$/);
});
test('amounts, IDs and idempotency keys fail before networking',async()=>{
  const transport=new FakeTransport(),client=new Client('https://api.example.test',TOKEN,{transport});
  for(const amount of [1,1.2,0,null,true,NaN,Infinity,1n,'-1','+1','1e-9','1 ','.2','0.'+'1'.repeat(31),'1'.repeat(49)])await assert.rejects(client.createInvoice(PROJECT,STORE,{amount},'key'),ValidationError);
  for(const key of ['',null,undefined,'bad key','x\r\n','x'.repeat(129)])await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1'},key),ValidationError);
  for(const id of [null,undefined,true,'project-name',PROJECT+'/../'])await assert.rejects(client.getInvoice(id,STORE),ValidationError);
  for(const field of ['exchange_rate_spread_percent','underpayment_tolerance_percent'])await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1',[field]:0.5},'key'),ValidationError);
  await assert.rejects(client.registerCustomToken(PROJECT,{price_usd:0.5}),ValidationError);
  assert.equal(transport.requests.length,0);
});
test('JSON encoding rejects lost values, cycles, custom serialization and excessive bodies',async()=>{
  const client=new Client('https://api.example.test',TOKEN,{transport:new FakeTransport()});
  const cycle={};cycle.x=cycle;
  let invoked=false;
  for(const metadata of [[],{value:undefined},{value:NaN},{value:2n},{value:9007199254740993},{value:new Date()},{value:new Array(2)}, {value:'x'.repeat(33000)},cycle,{toJSON(){invoked=true;return {};}}])await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1',metadata},'key'),ValidationError);
  const getter={};Object.defineProperty(getter,'x',{get(){invoked=true;return 1;},enumerable:true});
  await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1',metadata:getter},'key'),ValidationError);assert.equal(invoked,false);
  const invoice={};Object.defineProperty(invoice,'amount',{get(){invoked=true;return '1';},enumerable:true});
  await assert.rejects(client.createInvoice(PROJECT,STORE,invoice,'key'),ValidationError);
  const list=[1];Object.defineProperty(list,'0',{get(){invoked=true;return 1;},enumerable:true});
  await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1',metadata:{list}},'key'),ValidationError);
  await assert.rejects(client.createInvoice(PROJECT,STORE,{amount:'1',[Symbol('lost')]:1},'key'),ValidationError);assert.equal(invoked,false);
  await assert.rejects(client.registerTokenAsset(PROJECT,undefined),ValidationError);
});
test('query values use exact percent encoding and omit undefined/null',async()=>{
  const transport=new FakeTransport(reply()),client=new Client('https://api.example.test',TOKEN,{transport});
  const search="EUR & BTC/+?'✓";await client.listInvoices(PROJECT,{search,limit:1,unused:undefined,ignored:null});
  const url=new URL(transport.requests[0].url);assert.equal(url.searchParams.get('search'),search);assert.equal(url.searchParams.has('unused'),false);assert.ok(url.search.includes('%20'));assert.ok(url.search.includes('%27'));
  for(const query of [[],{'bad key':1},{search:[]},{limit:NaN},{search:'\ud800'}])await assert.rejects(client.listInvoices(PROJECT,query),ValidationError);
});
test('HTTP rate headers parse strict seconds and standard HTTP dates',()=>{
  const response=new HTTPResponse(429,{'Retry-After':'12','X-RateLimit-Limit':'120','X-RateLimit-Remaining':'0','X-RateLimit-Reset':'1800000060'},Buffer.alloc(0));
  assert.equal(response.retryAfterSeconds(),12);assert.deepEqual(response.rateLimit(),{limit:120,remaining:0,reset:1800000060});
  const now=1800000000000;assert.equal(new HTTPResponse(429,{'retry-after':new Date(now+20000).toUTCString()},Buffer.alloc(0)).retryAfterSeconds(now),20);
  for(const value of ['tomorrow','-1','2\n','9'.repeat(20),'13 Sep 2030 00:00:00 GMT'])assert.equal(new HTTPResponse(429,{'retry-after':value},Buffer.alloc(0)).retryAfterSeconds(),null);
});
