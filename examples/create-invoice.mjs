// Inert helper: importing this file never sends a request.
// The caller must persist the payload and key with its order before invoking it.
export async function createOrderCheckout(client, {projectId, storeId, payload, idempotencyKey}) {
  const result = await client.createInvoice(projectId, storeId, payload, idempotencyKey);
  return {publicInvoiceId: result.data.public_id, checkoutURL: result.links.checkout};
}
