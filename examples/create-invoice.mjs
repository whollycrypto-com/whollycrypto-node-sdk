// Inert helper: importing this file never sends a request.
// The caller must persist the payload and key with its order before invoking it.
// Variable example: const amount = '25.00'; payload: {amount: String(amount), currency: 'USD'}.
// Keep decimal input as a string. String(number) cannot recover lost precision.
export async function createOrderCheckout(client, {projectId, storeId, payload, idempotencyKey}) {
  const result = await client.createInvoice(projectId, storeId, payload, idempotencyKey);
  return {publicInvoiceId: result.data.invoice_id, checkoutURL: result.links.checkout};
}
