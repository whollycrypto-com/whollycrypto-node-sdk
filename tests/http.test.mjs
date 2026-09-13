import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Client,CheckoutClient,HTTPTransport,TransportError,RequestAbortedError,APIError,InvalidResponseError} from 'whollycrypto';
import {PROJECT,STORE,INVOICE,TOKEN} from './helpers.mjs';

async function fixture(t,tls=false){
  const requests=[];let cert,key,temporary;
  if(tls){
    temporary=await mkdtemp(path.join(tmpdir(),'wholly-node-tls-'));
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',temporary+'/key.pem','-out',temporary+'/cert.pem'],{stdio:'ignore'});
    cert=await readFile(temporary+'/cert.pem','utf8');key=await readFile(temporary+'/key.pem');
  }
  const handler=async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    requests.push({url:req.url,headers:req.headers,port:req.socket.remotePort,body:Buffer.concat(chunks).toString()});
    const mode=new URL(req.url,'https://fixture.test').searchParams.get('search');
    let status=200,data=JSON.stringify({data:{amount:'0.123456789012345678',atomic:'9999999999999999999999'}}),headers={'Content-Type':'application/json'};
    if(mode==='timeout'){setTimeout(()=>{if(!res.destroyed)res.end(data);},200);return;}
    if(mode==='redirect'){status=302;headers.Location='/trap';}
    if(mode==='html'){headers['Content-Type']='text/html';data='<h1>Login</h1>';}
    if(mode==='large')data=JSON.stringify({data:'x'.repeat(3000)});
    if(mode==='chunked-large'){res.writeHead(200,headers);res.write('x'.repeat(1000));res.end('x'.repeat(2000));return;}
    if(mode==='invalid-utf8'){res.writeHead(200,headers);res.end(Buffer.from([123,34,120,34,58,34,255,34,125]));return;}
    if(mode==='quota'){status=429;headers['Retry-After']='17';headers['X-RateLimit-Limit']='120';headers['X-RateLimit-Remaining']='0';}
    if(mode==='truncated'){res.writeHead(200,{...headers,'Content-Length':'1000'});res.write('{"data":{}}');res.socket.end();return;}
    if(['duplicate-length','negative-length','both-framings','invalid-transfer','duplicate-retry','huge-headers'].includes(mode)){
      const extra={
        'duplicate-length':'Content-Length: 2\r\nContent-Length: 2',
        'negative-length':'Content-Length: -1',
        'both-framings':'Content-Length: 2\r\nTransfer-Encoding: chunked',
        'invalid-transfer':'Transfer-Encoding: gzip',
        'duplicate-retry':'Retry-After: 1\r\nRetry-After: 2',
        'huge-headers':'X-Fixture: '+'a'.repeat(34000),
      }[mode];
      res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n'+extra+'\r\n\r\n{}');return;
    }
    res.writeHead(status,{...headers,'Content-Length':Buffer.byteLength(data)});res.end(data);
  };
  const server=tls?https.createServer({cert,key},handler):http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(temporary)await rm(temporary,{recursive:true,force:true});});
  return {url:`${tls?'https':'http'}://127.0.0.1:${server.address().port}`,requests,cert};
}
test('native HTTP transport reuses connections without leaking bearer tokens to public methods',async t=>{
  const {url,requests}=await fixture(t),transport=new HTTPTransport();t.after(()=>transport.close());
  const old=process.env.HTTPS_PROXY;process.env.HTTPS_PROXY='http://127.0.0.1:1';t.after(()=>{if(old===undefined)delete process.env.HTTPS_PROXY;else process.env.HTTPS_PROXY=old;});
  const client=new Client(url,TOKEN,{allowInsecureLocalhost:true,transport});
  const checkout=new CheckoutClient(url,{allowInsecureLocalhost:true,transport});
  await client.createInvoice(PROJECT,STORE,{amount:'25.00'},'persisted');await client.health();await checkout.getInvoice(INVOICE);
  assert.equal(new Set(requests.map(r=>r.port)).size,1);assert.equal(requests[0].headers.authorization,'Bearer '+TOKEN);
  assert.equal(requests[0].headers['idempotency-key'],'persisted');assert.equal(JSON.parse(requests[0].body).amount,'25.00');
  for(const r of requests.slice(1))assert.equal(r.headers.authorization,undefined);
});
test('TLS certificates must be trusted and hostname verification stays enabled',async t=>{
  const {url,cert}=await fixture(t,true),client=new Client(url,TOKEN);t.after(()=>client.close());
  await assert.rejects(client.health(),e=>e instanceof TransportError&&!e.retryable);
  const trusted=new Client(url,TOKEN,{ca:cert});t.after(()=>trusted.close());assert.equal((await trusted.health()).data.amount,'0.123456789012345678');
});
test('real response limits, invalid UTF-8, HTML, redirects and quota',async t=>{
  const {url,requests}=await fixture(t),client=new Client(url,TOKEN,{allowInsecureLocalhost:true,maxResponseBytes:1024});t.after(()=>client.close());
  for(const mode of ['large','chunked-large'])await assert.rejects(client.listInvoices(PROJECT,{search:mode}),TransportError);
  for(const mode of ['invalid-utf8','html'])await assert.rejects(client.listInvoices(PROJECT,{search:mode}),InvalidResponseError);
  await assert.rejects(client.listInvoices(PROJECT,{search:'redirect'}),e=>e instanceof APIError&&e.errorCode==='redirect_not_followed');
  assert.ok(!requests.some(r=>r.url==='/trap'));
  await assert.rejects(client.listInvoices(PROJECT,{search:'quota'}),e=>e.retryAfterSeconds===17&&e.response.rateLimit().remaining===0);
});
test('timeouts, cancellation, truncation and ambiguous framing close the connection',async t=>{
  const {url}=await fixture(t),client=new Client(url,TOKEN,{allowInsecureLocalhost:true,timeoutMs:50,connectTimeoutMs:30});t.after(()=>client.close());
  await assert.rejects(client.listInvoices(PROJECT,{search:'timeout'}),e=>e instanceof TransportError&&e.retryable);
  const controller=new AbortController();const pending=client.listInvoices(PROJECT,{search:'timeout'},{signal:controller.signal});setTimeout(()=>controller.abort(),5);await assert.rejects(pending,RequestAbortedError);
  const normal=new Client(url,TOKEN,{allowInsecureLocalhost:true});t.after(()=>normal.close());
  for(const mode of ['truncated','duplicate-length','negative-length','both-framings','invalid-transfer','duplicate-retry','huge-headers'])await assert.rejects(normal.listInvoices(PROJECT,{search:mode}),TransportError,mode);
  assert.ok((await normal.health()).data,'A bad response must not poison the next connection');
});
