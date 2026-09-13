# Payment methods and reconciliation

Use an open client from the README. Project, store and asset arguments are API UUIDs. Token registration performs live chain checks; allow a longer timeout (`new Client(apiURL, token, {timeoutMs: 60_000})`) and configure your reverse proxy accordingly. If registration times out, inspect the asset list before trying again.

## Catalog tokens

```javascript
const candidates = await client.listTokenCandidates(projectId, 'ethereum', {
  q: 'USDC', limit: 20,
});
const result = await client.registerTokenAsset(projectId, {
  chain_slug: 'ethereum', coingecko_id: 'usd-coin', enabled: true,
});
const assetId = result.data.asset_id;
```

A catalog match is discovery, not readiness to accept payments. The merchant checks on-chain metadata, scanner support, project access and wallet readiness.

## Custom tokens and pricing

```javascript
const pools = await client.discoverCustomDexPools(projectId, 'ethereum', contractAddress);

// Choose one price mode. A fixed USD price:
const fixed = await client.registerCustomToken(projectId, {
  chain_slug: 'ethereum', contract_address: contractAddress,
  name: 'Example token', symbol: 'EXAMPLE', price_usd: '0.25',
});

// OR use a pool returned by discovery, omitting price_usd:
const automatic = await client.registerCustomToken(projectId, {
  chain_slug: 'ethereum', contract_address: contractAddress,
  name: 'Example token', symbol: 'EXAMPLE',
  price_mode: 'dex', dex_pair_address: chosenPoolAddress,
});
```

Identify contracts by chain/address, not just their ticker. Discovery does not guarantee safe liquidity; the merchant rechecks the pool and pricing rules.

## Store selection and confirmations

```javascript
const current = await client.listStorePaymentAssets(projectId, storeId);

// The ENTIRE desired on-chain selection, not an append operation:
await client.updateStorePaymentAssets(projectId, storeId, [
  {asset_id: bitcoinAssetId, display_order: 0},
  {asset_id: usdcAssetId, display_order: 1},
]);
await client.updateStoreConfirmationPolicy(projectId, storeId, bitcoinAssetId, {
  strategy: 'custom', required_confirmations: 2,
});
// Restore the inherited project policy:
await client.updateStoreConfirmationPolicy(projectId, storeId, bitcoinAssetId, {
  strategy: 'inherit',
});
```

Passing `[]` clears **all on-chain selections**. Lightning is configured separately in the console and its readiness appears in `lightning`. Zero confirmations permits settlement on detection and increases reversal/double-spend risk. Finality-only chains may reject editable confirmation counts.

## Balances and exceptions

```javascript
const wallets = (await client.listProjectWallets(projectId)).data;
for (const wallet of wallets) {
  for (const balance of wallet.balances) {
    // Keep balance and balance_atomic exact; inspect status and checked_at.
    // Stale, pending or unavailable does not mean a zero balance.
  }
}

const queue = await client.listReconciliation(projectId, {
  status: 'open', reason: 'underpaid', page: 1,
});
const detail = await client.getReconciliation(projectId, publicInvoiceId, 2);
```

The detail's page selects decision history only. Wallet responses contain public addresses and balances, never secrets. Refunds, sending, cancellation and reconciliation decisions remain controlled console actions, not SDK mutations.
