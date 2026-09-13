/** Amounts and percentages are plain decimal strings, never JavaScript numbers. */
export type DecimalString = string;
export type UUID = string;
export type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }
export type Query = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type InvoiceStatus = 'new' | 'processing' | 'settled' | 'expired' | 'invalid' | 'cancelled';
export type CheckoutState = 'waiting' | 'confirming' | 'paid' | 'underpaid' | 'expired';
export type CheckoutFontSize = 12 | 14 | 16 | 18 | 20 | 24;
export type CheckoutImageKind = 'logo_light' | 'logo_dark' | 'favicon';
export interface CheckoutAppearanceOverride {
  inherit_default_store?: boolean;
  title?: string; intro?: string; outro?: string;
  /** Legacy alias for intro. Never send both. */
  customer_message?: string;
  intro_font_size?: CheckoutFontSize; outro_font_size?: CheckoutFontSize;
  theme?: 'system' | 'light' | 'dim' | 'dark';
  accent_color?: string; background_color?: string; card_color?: string; button_color?: string;
  logo_size?: 'small' | 'medium' | 'large'; logo_alignment?: 'left' | 'center';
  images?: Partial<Record<CheckoutImageKind, {store_id: UUID; kind?: CheckoutImageKind} | null>>;
  show_order_id?: boolean; show_description?: boolean; details_expanded?: boolean;
  featured_chains?: string[]; featured_asset_ids?: UUID[]; default_asset_id?: UUID | null;
  messages?: Partial<Record<'en' | 'de', Partial<Record<CheckoutState, string>>>>;
  support_email?: string; support_url?: string; terms_url?: string; privacy_url?: string;
  return_button_text?: string;
}
export interface InvoiceCreate {
  amount: DecimalString; currency?: string | null; order_id?: string | null;
  email?: string | null; description?: string | null; expires_in_seconds?: number | null;
  exchange_rate_spread_percent?: DecimalString | null; underpayment_tolerance_percent?: DecimalString | null;
  ipn_url?: string | null; redirect_url?: string | null; cancel_url?: string | null;
  redirect_automatically?: boolean | null; language?: string | null;
  metadata?: JsonObject | null; checkout_appearance?: CheckoutAppearanceOverride | null;
}
/** Known fields are typed; additional response fields remain accessible as unknown. */
export interface APIObject { [key: string]: unknown; }
export interface Envelope<T> extends APIObject { data: T; }
export interface Invoice extends APIObject {
  id: UUID; public_id: UUID; project_id: UUID; store_id: UUID;
  amount: DecimalString; currency: string; status: InvoiceStatus;
  sequence: number | string; order_id: string | null; email: string | null;
  created_at: string; expires_at: string;
  source?: string; description?: string | null;
  customer_name?: string | null; customer_address?: string | null;
  exchange_rate_spread_percent?: DecimalString; underpayment_tolerance_percent?: DecimalString;
  amount_status?: string; timing_status?: string; resolution?: string;
  winning_payment_intent_id?: UUID | null; payment_intents?: PaymentIntent[];
  settled_at?: string | null; cancelled_at?: string | null; archived_at?: string | null;
  monitoring_expires_at?: string; updated_at?: string;
  ipn_url?: string | null; redirect_url?: string | null; cancel_url?: string | null;
  redirect_automatically?: boolean; checkout_language?: string; metadata?: JsonObject;
}
export interface PaymentIntent extends APIObject {
  id: UUID; asset_id: UUID; chain_slug: string; symbol: string;
  asset_decimals: number; status: string;
  expected_amount: DecimalString; expected_amount_atomic: string;
  received_amount: DecimalString; received_amount_atomic: string;
  confirmed_amount: DecimalString; confirmed_amount_atomic: string;
  minimum_payment_amount?: DecimalString; minimum_payment_amount_atomic?: string;
  quote_rate?: DecimalString; payment_rail?: string; payment_uri?: string | null; payable?: boolean;
  destination_address?: string | null; destination_tag?: string | null;
  finality_mode?: string; required_confirmations?: number;
  quote_expires_at?: string; monitoring_expires_at?: string;
  first_payment_at?: string | null; fully_paid_at?: string | null; finalized_at?: string | null;
  last_checked_at?: string | null; last_monitor_error?: string | null;
}
export interface InvoiceResult extends Envelope<Invoice> { links: {checkout: string; [key: string]: unknown}; }
export interface InvoicePage extends Envelope<Invoice[]> {
  pagination: {limit: number; offset: number; total: number | string; has_more: boolean};
}
export interface InvoiceFilters extends Query { store_id?: UUID; status?: InvoiceStatus; search?: string; limit?: number; offset?: number; }
export interface TokenFilters extends Query { q?: string; limit?: number; }
export interface TokenRegistration { chain_slug: string; coingecko_id: string; enabled?: boolean; }
export type CustomTokenRegistration = {
  chain_slug: string; contract_address: string; name: string; symbol: string;
} & ({price_mode?: 'fixed'; price_usd: DecimalString; dex_pair_address?: never}
  | {price_mode: 'dex'; dex_pair_address: string; price_usd?: never});
export interface AssetPolicyUpdate {
  enabled: boolean; finality_mode: 'confirmations' | 'finalized'; required_confirmations: number;
  monitoring_minutes: number; late_monitoring_days: number;
}
export interface StoreAssetSelection { asset_id: UUID; display_order: number; }
export type ConfirmationPolicyUpdate = {strategy: 'inherit'; required_confirmations?: never}
  | {strategy: 'custom'; required_confirmations: number};
export interface PaymentAsset extends APIObject {
  id: UUID; chain_slug: string; symbol: string; asset_kind: 'native' | 'token';
  decimals?: number; payment_rail?: string; contract_address?: string | null;
  name?: string; network?: string; asset_key?: string;
  coingecko_id?: string | null; icon_path?: string | null; token_standard?: string | null;
  scanner_ready?: boolean; balance_ready?: boolean; payment_supported?: boolean;
}
export interface ProjectPaymentAsset extends APIObject {
  asset: PaymentAsset; wallet_readiness: string;
  policy?: AssetPolicyUpdate; wallet?: APIObject | null;
}
export interface StorePaymentAsset extends APIObject {
  asset: PaymentAsset; selected: boolean; display_order: number;
  project_policy?: Partial<AssetPolicyUpdate>; wallet_readiness?: string; wallet?: APIObject | null;
  confirmation_policy?: {
    finality_mode: string; project_required_confirmations: number;
    override_required_confirmations: number | null; effective_required_confirmations: number;
    editable: boolean; minimum_required_confirmations: number; maximum_required_confirmations: number;
  };
}
export interface StoreAssetsResult extends Envelope<StorePaymentAsset[]> {
  lightning?: APIObject & {payment_rail?: string; symbol?: string; asset_decimals?: number; enabled?: boolean; ready?: boolean};
}
export interface RegisteredAsset extends APIObject { asset_id: UUID; }
export interface WalletBalance extends APIObject {
  wallet_id: UUID; asset_id: UUID; symbol: string; name: string; decimals: number;
  asset_kind: string; contract_address: string | null;
  balance: DecimalString | null; balance_atomic: string | null;
  price_usd: DecimalString | null; value_usd: DecimalString | null;
  status: string; checked_at: string | null; last_error: string | null;
  project_enabled?: boolean; tracking_active?: boolean; coingecko_id?: string | null;
}
export interface Wallet extends APIObject {
  id: UUID; balances: WalletBalance[];
  project_id?: UUID; chain_slug?: string; network?: string; status?: string; label?: string | null;
  public_key?: string | null; primary_address?: string | null;
  total_value_usd?: DecimalString | null; balance_status?: string; balance_checked_at?: string | null;
}
export interface ReconciliationPage extends Envelope<APIObject[]> { pagination: APIObject; counts: APIObject; }
export interface ReconciliationDetail extends APIObject { invoice: APIObject; history: APIObject[]; history_pagination: APIObject; }
