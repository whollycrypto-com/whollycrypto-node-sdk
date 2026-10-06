// Trusted backend only. Importing this file never sends requests or funds.
// import {MarketplaceClient} from 'whollycrypto';
// const client = new MarketplaceClient('https://api.example.com', secretFromServerConfig);
export async function marketplaceInvoice(client, projectId, storeId, vendorIds, savedKey) {
  if (vendorIds.length !== 3) throw new Error('Use three approved vendors');
  return client.createInvoice(projectId, {
    store_id: storeId, amount: '300.00', currency: 'USD', order_id: 'marketplace-cart-1042',
    // Use a decimal string from validated input, not String(0.1 + 0.2).
    allocations: vendorIds.map(vendor_id => ({vendor_id, gross_amount: '100.00'})),
  }, savedKey); // Persist key/body before sending; reuse both after a timeout.
  // Save data.invoice_id and redirect to TOP-LEVEL links.checkout.
}
export async function prepareMarketplacePayout(client, projectId, allocationIds, feeCapAtomic, gasCapAtomic, savedKey) {
  // One asset. BTC needs all unpaid shares per invoice. Native-coin atomic caps.
  // Preparation reserves funds; it does NOT broadcast.
  return client.createPayout(projectId, {
    allocation_ids: allocationIds, maximum_network_fee_atomic: feeCapAtomic,
    maximum_gas_funding_atomic: gasCapAtomic,
  }, savedKey);
}
// Review getPayout() recipients, amounts, plan_hash, revision and caps first.
// Only after explicit authorization:
// await client.approvePayout(projectId, payoutId, {
//   revision: reviewedRevision, expected_plan_hash: reviewedHash, confirm: true,
// }, separatelyPersistedApprovalKey);
// Follow getPayout() until state=paid, not merely broadcast.
