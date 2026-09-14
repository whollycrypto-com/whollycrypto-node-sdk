import {InvalidSignatureError, parseNotification} from 'whollycrypto';

/**
 * IPN and webhooks use this same receiver. See ipn-webhooks.md and notification.json.
 * Configure the Store -> IPN secret for IPN, or that webhook endpoint's own secret.
 * Use separate trusted routes; never select a secret from unverified request data.
 * Mount AFTER express.raw({type:'application/json', limit:'256kb'}), not express.json().
 * enqueue must commit to YOUR durable database/queue before resolving. Reject on
 * storage failure. It must atomically deduplicate the replayKey and reject conflicting
 * invoiceState values, not raw bodies: multiple event types share one revision.
 * Event/delivery headers are unsigned and must never be the unique key.
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
    if (notice.payload.project_id !== undefined && notice.payload.project_id.toLowerCase() !== project) return res.status(400).end();
    const invoiceState = JSON.stringify(['invoice_id','status','amount_status','timing_status','resolution','sequence','amount','currency','order_id']
      .map(key => key === 'sequence' ? notice.sequence : (notice.payload[key] ?? null)));
    try{
      await enqueue({
        replayKey:`${project}:${notice.invoiceId}:${notice.sequence}`,
        projectId:project,invoiceId:notice.invoiceId,sequence:notice.sequence,
        rawBody,notification:notice,invoiceState,
      });
    }catch{return res.status(503).end();}
    return res.status(204).end();
  };
}

// Your worker re-fetches the signed public invoice ID through Client.getInvoice().
// Match its stored project/store, order, amount and currency. Fulfil only when
// settled, exactly once in a database transaction, and don't roll state backwards.
// Retain the raw signed body privately; compare invoiceState for revision conflicts.
// For per-event jobs instead, v2 payload.event_id is signed. Fulfilment still needs
// a separate, durable order-level idempotency guard. Legacy headers are unsigned.
