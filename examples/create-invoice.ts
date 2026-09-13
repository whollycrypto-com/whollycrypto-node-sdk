import type {Client, InvoiceCreate} from 'whollycrypto';

// Inert helper. Persist payload/key before calling; never generate a key on retry.
export async function createOrderCheckout(client: Client, request: {
  projectId: string;
  storeId: string;
  payload: InvoiceCreate;
  idempotencyKey: string;
}): Promise<{publicInvoiceId: string; checkoutURL: string}> {
  const result = await client.createInvoice(
    request.projectId, request.storeId, request.payload, request.idempotencyKey,
  );
  return {publicInvoiceId: result.data.public_id, checkoutURL: result.links.checkout};
}
