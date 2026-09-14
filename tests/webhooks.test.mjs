import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {inspect} from 'node:util';
import {readFileSync} from 'node:fs';
import {parseNotification,verifySignature,InvalidSignatureError,ValidationError} from 'whollycrypto';
import {createWebhookHandler} from '../examples/webhook-handler.mjs';
import {INVOICE,PROJECT,STORE,ASSET} from './helpers.mjs';
const SECRET='isolated-callback-signing-fixture',NOW=1800000000;
const signed=(body,now=NOW)=>'t='+now+',v1='+createHmac('sha256',SECRET).update(String(now)+'.').update(body).digest('hex');
const body=Buffer.from(JSON.stringify({invoice_id:INVOICE,status:'settled',sequence:4,amount:'25.00',currency:'EUR',metadata:{customer:'private fixture',items:[1,2]}}));
const headers=(raw=body,now=NOW)=>({'Wholly-Signature':signed(raw,now),'Wholly-Event-Id':PROJECT,'Wholly-Delivery-Id':STORE});
test('documented callback snapshot verifies for every invoice status',()=>{
  const payload=JSON.parse(readFileSync(new URL('../examples/notification.json',import.meta.url),'utf8'));
  assert.equal(payload.payload_version,2);assert.equal(payload.amount,'49.9');assert.equal(payload.currency,'EUR');
  assert.equal(payload.paid_chain,'ethereum');assert.equal(payload.paid_asset,'USDC');
  assert.equal(payload.settlement_exchange_rate.rate,'1.17');
  for(const status of ['new','processing','settled','expired','invalid','cancelled']){
    const entry={...payload,status};
    if(status!=='settled')for(const key of ['paid_chain','paid_asset','paid_payment_method_id','settlement_exchange_rate'])entry[key]=null;
    const raw=Buffer.from(JSON.stringify(entry));
    const h={...headers(raw),'Wholly-Event-Id':payload.event_id};
    const parsed=parseNotification(raw,h,SECRET,{now:NOW});
    assert.equal(parsed.status,status);assert.equal(parsed.payload.paid_chain,entry.paid_chain);
    assert.deepEqual(parsed.payload.settlement_exchange_rate,entry.settlement_exchange_rate);
    assert.throws(()=>parseNotification(Buffer.from(raw.toString().replaceAll('1.17','9.99')+' '),h,SECRET,{now:NOW}),InvalidSignatureError);
    assert.throws(()=>parseNotification(raw,headers(raw),SECRET,{now:NOW}),InvalidSignatureError);
    assert.throws(()=>parseNotification(raw,h,'another-endpoint-secret',{now:NOW}),InvalidSignatureError);
  }
});
test('exact HMAC bytes, clock boundaries and invalid signatures',()=>{
  for(const now of [NOW-300,NOW,NOW+300])assert.equal(verifySignature(body,signed(body),SECRET,{now}),true);
  for(const now of [NOW-301,NOW+301])assert.equal(verifySignature(body,signed(body),SECRET,{now}),false);
  assert.equal(verifySignature(Buffer.concat([body,Buffer.from(' ')]),signed(body),SECRET,{now:NOW}),false);
  for(const signature of [undefined,'',signed(body)+'\n',signed(body)+',v1='+'a'.repeat(64),signed(body).replace('t=','t=0')])assert.equal(verifySignature(body,signature,SECRET,{now:NOW}),false);
  assert.equal(verifySignature(body,signed(body),'wrong',{now:NOW}),false);
  assert.equal(verifySignature(Buffer.alloc(262145),signed(body),SECRET,{now:NOW}),false);
  for(const fn of [()=>verifySignature(body.toString(),signed(body),SECRET),()=>verifySignature(body,signed(body),''),()=>verifySignature(body,signed(body),SECRET,{now:-1}),()=>verifySignature(body,signed(body),SECRET,{toleranceSeconds:NaN})])assert.throws(fn,ValidationError);
});
test('notification payloads are readonly; unsigned event IDs cannot define replay identity',()=>{
  const first=parseNotification(body,headers(),SECRET,{now:NOW});
  const second=parseNotification(body,{...headers(),'Wholly-Event-Id':ASSET},SECRET,{now:NOW});
  assert.equal(first.invoiceId,INVOICE);assert.equal(first.sequence,'4');assert.equal(first.status,'settled');
  assert.notEqual(first.eventId,second.eventId);assert.equal(first.invoiceId+':'+first.sequence,second.invoiceId+':'+second.sequence);
  assert.throws(()=>{first.payload.status='new';},TypeError);assert.throws(()=>first.payload.metadata.items.push(3),TypeError);
  assert.ok(!inspect(first,{showHidden:true}).includes('private fixture'));assert.throws(()=>JSON.stringify(first),TypeError);
  const large=Buffer.from('{"invoice_id":"'+INVOICE+'","status":"settled","sequence":9007199254740993}');
  assert.equal(parseNotification(large,headers(large),SECRET,{now:NOW}).sequence,'9007199254740993');
});
test('duplicate security headers, invalid UTF-8/JSON/shape and invalid identifiers fail',()=>{
  for(const h of [undefined,null,[],{...headers(),'wholly-signature':signed(body)},{...headers(),'Wholly-Event-Id':'bad'},[...Object.entries(headers()),['wholly-delivery-id',STORE]],{'Wholly-Signature':[signed(body)]}])assert.throws(()=>parseNotification(body,h,SECRET,{now:NOW}),InvalidSignatureError);
  assert.equal(parseNotification(body,Object.entries(headers()).flat(),SECRET,{now:NOW}).sequence,'4');
  for(const payload of [{},{invoice_id:INVOICE,status:['settled'],sequence:1},{invoice_id:INVOICE,status:'settled',sequence:true},{invoice_id:INVOICE,status:'settled',sequence:0},{invoice_id:INVOICE,status:'settled',sequence:'9223372036854775808'},{invoice_id:'bad',status:'new',sequence:1}]){
    const raw=Buffer.from(JSON.stringify(payload));assert.throws(()=>parseNotification(raw,headers(raw),SECRET,{now:NOW}),InvalidSignatureError);
  }
  for(const raw of [Buffer.from('{"sequence":1,"sequence":2}'),Buffer.from([0xff])])assert.throws(()=>parseNotification(raw,headers(raw),SECRET,{now:NOW}),InvalidSignatureError);
});
test('receiver example verifies before storage and never acknowledges failed enqueue',async()=>{
  const now=Math.floor(Date.now()/1000),rawHeaders=Object.entries(headers(body,now)).flat();
  const response=()=>({code:0,ended:false,status(code){this.code=code;return this;},end(){this.ended=true;return this;}});
  const calls=[];const handler=createWebhookHandler({projectId:PROJECT,signingSecret:SECRET,enqueue:async value=>{calls.push(value);}});
  const req={method:'POST',body,rawHeaders};let res=response();await handler(req,res);assert.equal(res.code,204);assert.equal(calls.length,1);
  assert.equal(calls[0].replayKey,`${PROJECT}:${INVOICE}:4`);assert.deepEqual(calls[0].rawBody,body);
  res=response();await handler({...req,rawHeaders:[]},res);assert.equal(res.code,400);assert.equal(calls.length,1);
  res=response();await handler({...req,body:JSON.parse(body)},res);assert.equal(res.code,400);
  const failing=createWebhookHandler({projectId:PROJECT,signingSecret:SECRET,enqueue:async()=>{throw Error('storage failed');}});
  res=response();await failing(req,res);assert.equal(res.code,503);
});

test('v2 receiver accepts separate events at one revision and rejects wrong signed scope',async()=>{
  const now=Math.floor(Date.now()/1000),base=JSON.parse(body),queue=new Map();
  const handler=createWebhookHandler({projectId:PROJECT,signingSecret:SECRET,enqueue:async item=>{
    if(queue.has(item.replayKey)&&queue.get(item.replayKey)!==item.invoiceState)throw Error('Conflicting invoice state');
    queue.set(item.replayKey,item.invoiceState);
  }});
  const deliver=async fields=>{
    const raw=Buffer.from(JSON.stringify({...base,payload_version:2,project_id:PROJECT,store_id:STORE,event_id:ASSET,event_type:'payment.received',...fields}));
    const h={...headers(raw,now),'Wholly-Event-Id':JSON.parse(raw).event_id};
    const res={code:0,status(code){this.code=code;return this;},end(){return this;}};
    await handler({method:'POST',body:raw,rawHeaders:Object.entries(h).flat()},res);return res.code;
  };
  assert.equal(await deliver({}),204);
  assert.equal(await deliver({event_id:STORE,event_type:'invoice.settled',payment_info:{method_count:1}}),204);
  assert.equal(queue.size,1);
  assert.equal(await deliver({project_id:ASSET}),400);
  assert.equal(await deliver({status:'invalid'}),503);
});
