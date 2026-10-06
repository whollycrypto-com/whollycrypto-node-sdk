// Receiver building block. Read the original HTTP bytes, not re-encoded JSON.
import {verifySignature} from 'whollycrypto';
export function verifiedMarketplaceEvent(rawBody, signatureHeader, secret, expectedProjectIds) {
  if(!verifySignature(rawBody,signatureHeader,secret))throw Error('Invalid or expired signature');
  const event=JSON.parse(Buffer.from(rawBody).toString('utf8'));
  const types=["marketplace.invoice.created","marketplace.allocations.available","marketplace.allocations.held","marketplace.payout.approved","marketplace.payout.broadcast","marketplace.payout.confirmed","marketplace.payout.partial","marketplace.payout.failed","marketplace.payout.cancelled","marketplace.refund.prepared","marketplace.refund.confirmed"];
  if(!event||event.payload_version!==1||typeof event.event_id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(event.event_id)||!expectedProjectIds.includes(event.project_id)||!types.includes(event.event_type)||!event.data||typeof event.data!=='object'||Array.isArray(event.data))throw Error('Unexpected Marketplace event');
  return event;
}
// In one DB transaction, insert authenticated event_id with a UNIQUE constraint
// and enqueue processing. Acknowledge with 2xx only after durable acceptance.
// Duplicate deliveries must not repeat actions. Invoice settlement is NOT vendor
// payout confirmation. Do not feed these envelopes into parseNotification.
