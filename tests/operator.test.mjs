import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspect} from 'node:util';
import {createHmac} from 'node:crypto';
import {verifiedOperatorEvent} from '../examples/operator-webhook.mjs';
import {OperatorClient,OperatorOnboardingClient,APIError,ValidationError,TransportError} from 'whollycrypto';
import {PROJECT,FakeTransport,reply} from './helpers.mjs';
const token='wc_operator_'+'1'.repeat(32)+'_'+'a'.repeat(64),key='saved-operator-request-1042';
const fixture=JSON.parse(await readFile(new URL('./fixtures/operator-v1.json',import.meta.url),'utf8'));
test('Operator webhook example rejects tampering and unknown tenants',()=>{
  const secret='synthetic-operator-hook-secret',timestamp=Math.floor(Date.now()/1000);
  const body=Buffer.from(JSON.stringify({event_id:PROJECT,merchant_id:PROJECT,event_type:'merchant.created'}));
  const signature='t='+timestamp+',v1='+createHmac('sha256',secret).update(timestamp+'.').update(body).digest('hex');
  assert.equal(verifiedOperatorEvent(body,signature,secret,[PROJECT]).merchant_id,PROJECT);
  assert.throws(()=>verifiedOperatorEvent(Buffer.concat([body,Buffer.from(' ')]),signature,secret,[PROJECT]));
  assert.throws(()=>verifiedOperatorEvent(body,signature,secret,[]));
  assert.throws(()=>verifiedOperatorEvent(body,signature,'wrong-secret',[PROJECT]));
});
test('all Operator methods preserve documented paths, exact payloads, scope key and retry key',async t=>{
  assert.equal(fixture.methods.length,55);
  for(const e of fixture.methods)await t.test(e.name,async()=>{
    const transport=new FakeTransport(reply(e.response)),client=new OperatorClient('https://api.example.test',token,{transport});
    const args=e.ids.map(()=>PROJECT);if(e.method==='POST')args.push(structuredClone(e.body),key);
    assert.deepEqual(await client[e.name](...args),e.response);
    const request=transport.requests[0];assert.equal(request.method,e.method);
    assert.equal(new URL(request.url).pathname,e.public_path.replace(/\{[^}]+\}/g,PROJECT));
    assert.equal(request.headers.Authorization,'Bearer '+token);
    assert.equal(request.headers['Idempotency-Key'],e.method==='POST'?key:undefined);
    if(e.method==='POST')assert.deepEqual(JSON.parse(request.body.toString()),e.body);
  });
});
test('Operator validation, errors and safe retries',async()=>{
  assert.throws(()=>new OperatorClient('https://api.example.test','wc_live_fake'),ValidationError);
  const empty=new FakeTransport(),client=new OperatorClient('https://api.example.test',token,{transport:empty});
  await assert.rejects(client.createMerchant({name:'x'},'short'),ValidationError);
  await assert.rejects(client.getMerchant('../keys'),ValidationError);
  await assert.rejects(client.adjustCredits(PROJECT,{amount:1.2},key),ValidationError);
  assert.equal(empty.requests.length,0);assert.ok(!inspect(client,{showHidden:true}).includes(token));
  assert.throws(()=>JSON.stringify(client),TypeError);
  const transport=new FakeTransport(new TransportError('temporary',true),reply({ok:true}));
  await new OperatorClient('https://api.example.test',token,{transport,maxRetries:1,maxRetryDelayMs:0}).adjustCredits(PROJECT,{amount:'-1.20'},key);
  assert.equal(transport.requests[0],transport.requests[1]);
  const denied=new OperatorClient('https://api.example.test',token,{transport:new FakeTransport(reply({error:{code:'operator_scope_required',message:'Permission required'}},403))});
  await assert.rejects(denied.health(),e=>e instanceof APIError&&e.errorCode==='operator_scope_required');
});
test('invitation acceptance never sends credentials or automatically retries',async()=>{
  const transport=new FakeTransport(reply({kind:'invitation'}),reply({password_set:true}));
  const c=new OperatorOnboardingClient('https://api.example.test',{transport});
  await c.checkInvitation('private-link-token');await c.acceptInvitation('private-link-token','private-password',true);
  for(const r of transport.requests){assert.equal(r.headers.Authorization,undefined);assert.equal(r.headers['Idempotency-Key'],undefined);}
  assert.equal(JSON.parse(transport.requests[1].body).custody_acknowledged,true);
  const fail=new FakeTransport(reply({},503));
  await assert.rejects(new OperatorOnboardingClient('https://api.example.test',{transport:fail,maxRetries:3}).acceptInvitation('private-token','private-password',false),APIError);
  assert.equal(fail.requests.length,1);
});
