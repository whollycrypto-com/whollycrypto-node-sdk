// Receiver building block, not a complete web server. Keep the endpoint secret private.
import {verifySignature} from 'whollycrypto';
export function verifiedOperatorEvent(rawBody, signatureHeader, secret, expectedMerchantIds) {
  if (!verifySignature(rawBody, signatureHeader, secret)) throw Error('Invalid or expired signature');
  const event=JSON.parse(Buffer.from(rawBody).toString('utf8'));
  const events=['merchant.created','merchant.updated','user.created','user.updated','invitation.accepted','password_reset.completed','topup.settled','credit.balance_changed'];
  if (!event || typeof event !== 'object' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(event.event_id) || !expectedMerchantIds.includes(event.merchant_id) || !events.includes(event.event_type)) throw Error('Unexpected Operator event');
  return event;
}
// In one database transaction: insert event_id with a unique constraint and queue
// reconciliation. Duplicates get a successful response, not duplicate actions.
// Return 2xx only after durable acceptance. Never use parseNotification here:
// Operator events have merchant_id, not invoice_id/project_id/store_id.
