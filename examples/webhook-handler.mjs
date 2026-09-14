import {InvalidSignatureError, parseNotification} from 'whollycrypto';

/**
 * IPN and webhooks use this same receiver. See ipn-webhooks.md and notification.json.
 * Configure the Store -> IPN secret for IPN, or that webhook endpoint's own secret.
 * Use separate trusted routes; never select a secret from unverified request data.
 * Mount AFTER express.raw({type:'application/json', limit:'256kb'}), not express.json().
 * enqueue must commit to YOUR durable database/queue before resolving. Reject on
 * storage failure. It must atomically deduplicate the replayKey and reject conflicting
 * payloads. Event/delivery headers are unsigned and must never be the unique key.
 * This module starts no server and performs no fulfilment or payment writes.
 */
export function createWebhookHandler({projectId, signingSecret, enqueue}) {
  if (typeof projectId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(projectId)
      ||typeof signingSecret!=='string'||!signingSecret||typeof enqueue!=='function')throw new TypeError('Configure a project, signing secret and durable enqueue implementation.');
  const project=projectId.toLowerCase();
  return async function webhookHandler(req,res) {
    if(req.method!=='POST')return res.status(405).end();
    if(!Buffer.isBuffer(req.body))return res.status(400).end();
    const rawBody=Buffer.from(req.body);
    let notice;
    try{notice=parseNotification(rawBody,req.rawHeaders,signingSecret);}
    catch(error){if(error instanceof InvalidSignatureError)return res.status(400).end();return res.status(503).end();}
    try{
      await enqueue({
        replayKey:`${project}:${notice.invoiceId}:${notice.sequence}`,
        projectId:project,invoiceId:notice.invoiceId,sequence:notice.sequence,
        rawBody,notification:notice,
      });
    }catch{return res.status(503).end();}
    return res.status(204).end();
  };
}

// Your worker re-fetches the signed public invoice ID through Client.getInvoice().
// Match its stored project/store, order, amount and currency. Fulfil only when
// settled, exactly once in a database transaction, and don't roll state backwards.
// Persist the raw signed body for conflict detection and only the data you need.
