import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspect} from 'node:util';
import {createHmac} from 'node:crypto';
import {MarketplaceClient,ValidationError,APIError} from 'whollycrypto';
import {PROJECT,FakeTransport,reply} from './helpers.mjs';
import {verifiedMarketplaceEvent} from '../examples/marketplace-webhook.mjs';
const token='wc_marketplace_'+'1'.repeat(32)+'_'+'a'.repeat(64),key='saved-marketplace-request-1042';
const fixture=JSON.parse(await readFile(new URL('./fixtures/marketplace-v1.json',import.meta.url),'utf8'));
test('all Marketplace routes preserve project scope, exact bytes and idempotency',async t=>{
  assert.equal(fixture.methods.length,45);
  for(const e of fixture.methods)await t.test(e.name,async()=>{
    const transport=new FakeTransport(reply(e.response)),client=new MarketplaceClient('https://api.example.test',token,{transport});
    const args=[PROJECT,...e.ids.map(()=>PROJECT)],body=e.body?{...structuredClone(e.body),project_id:PROJECT}:null;
    if(e.method==='POST')args.push(body,key);else args.push({page:2});
    assert.deepEqual(await client[e.name](...args),e.response);
    const request=transport.requests[0],url=new URL(request.url);
    assert.equal(request.method,e.method);assert.equal(url.pathname,e.public_path.replace(/\{[^}]+\}/g,PROJECT));
    assert.equal(request.headers.Authorization,'Bearer '+token);
    assert.equal(request.headers['Idempotency-Key'],e.method==='POST'?key:undefined);
    if(body)assert.deepEqual(JSON.parse(request.body.toString()),body);else{assert.equal(url.searchParams.get('project_id'),PROJECT);assert.equal(url.searchParams.get('page'),'2');}
  });
});
test('Marketplace rejects imprecise amounts, scope conflicts and unsafe IDs before transport',async()=>{
  assert.throws(()=>new MarketplaceClient('https://api.example.test','wc_live_fake'),ValidationError);
  const transport=new FakeTransport(),c=new MarketplaceClient('https://api.example.test',token,{transport});
  await assert.rejects(c.createInvoice(PROJECT,{amount:0.1},key),ValidationError);
  await assert.rejects(c.createInvoice(PROJECT,{allocations:[{gross_amount:1}]},key),ValidationError);
  await assert.rejects(c.createPayout(PROJECT,{maximum_network_fee_atomic:10000},key),ValidationError);
  await assert.rejects(c.listVendors(PROJECT,{project_id:'another-project'}),ValidationError);
  await assert.rejects(c.getVendor(PROJECT,'../keys'),ValidationError);
  await assert.rejects(c.createVendor(PROJECT,{name:'vendor'},'short'),ValidationError);
  assert.equal(transport.requests.length,0);assert(!inspect(c,{showHidden:true}).includes(token));assert.throws(()=>JSON.stringify(c));
  const denied=new MarketplaceClient('https://api.example.test',token,{transport:new FakeTransport(reply({error:{code:'marketplace_scope_required',message:'Permission required'}},403))});
  await assert.rejects(denied.capabilities(PROJECT),e=>e instanceof APIError&&e.errorCode==='marketplace_scope_required');
});
test('Marketplace signed event uses authenticated project and event, not invoice status',()=>{
  const raw=Buffer.from(JSON.stringify({payload_version:1,event_id:PROJECT,project_id:PROJECT,event_type:'marketplace.payout.confirmed',data:{payout_id:PROJECT}}));
  const secret='synthetic-marketplace-hook-secret',stamp=Math.floor(Date.now()/1000),sig='t='+stamp+',v1='+createHmac('sha256',secret).update(stamp+'.').update(raw).digest('hex');
  assert.equal(verifiedMarketplaceEvent(raw,sig,secret,[PROJECT]).data.payout_id,PROJECT);
  assert.throws(()=>verifiedMarketplaceEvent(raw,sig,secret,[]));assert.throws(()=>verifiedMarketplaceEvent(Buffer.concat([raw,Buffer.from(' ')]),sig,secret,[PROJECT]));
});
