import Client, {Client as NamedClient, CheckoutClient, OperatorClient, OperatorOnboardingClient, parseNotification, APIError, HTTPTransport, type InvoiceCreate, type CustomTokenRegistration, type OperatorMerchantCreate} from 'whollycrypto';
const operator=new OperatorClient('https://api.example.com','wc_operator_'+'a'.repeat(32)+'_'+'b'.repeat(64));
const hosted:OperatorMerchantCreate={name:'Example',email:'merchant@example.test',currency:'EUR',onboarding:'direct',password:'a long synthetic password',require_password_change:true};
async function operatorExample(){await operator.createMerchant(hosted,'saved-request-key-1');await new OperatorOnboardingClient('https://api.example.com').checkInvitation('example');}
// @ts-expect-error Direct onboarding requires a password.
const missingPassword:OperatorMerchantCreate={name:'Example',email:'merchant@example.test',onboarding:'direct'};
// @ts-expect-error Invitation does not take a password.
const invitationPassword:OperatorMerchantCreate={name:'Example',email:'merchant@example.test',onboarding:'invitation',password:'not allowed'};
// @ts-expect-error Credit amounts must be decimal strings.
operator.adjustCredits('id',{amount:5,note:'Test',request_id:'id'},'request-key-12345');
void [operatorExample,missingPassword,invitationPassword];
const client: NamedClient = new Client('https://api.example.com','fixture');
const invoice: InvoiceCreate = {amount:'1.00',currency:'EUR',language:'pt-BR',checkout_appearance:{show_project_name:true,show_store_name:false,intro:'Hello',intro_font_size:18,theme:'dim',images:{logo_light:{store_id:'fixture'}},messages:{en:{paid:'Thanks'},'pt-BR':{paid:'Valeu!'},'zh-CN':{paid:'谢谢'},ja:{paid:'ありがとう'}}}};
invoice.payment_methods=[{chain_slug:'ethereum',asset_ids:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']},{chain_slug:'bitcoin',payment_rail:'lightning'}];
invoice.payment_methods=[{chain_slug:'ethereum',asset_tickers:['USDC','USDT']},{chain_slug:'bitcoin',payment_rail:'lightning',asset_tickers:['BTC']}];
// @ts-expect-error Select tickers or UUIDs, not both.
invoice.payment_methods=[{chain_slug:'ethereum',asset_tickers:['USDC'],asset_ids:['fixture']}];
// @ts-expect-error Lightning only receives BTC.
invoice.payment_methods=[{chain_slug:'bitcoin',payment_rail:'lightning',asset_tickers:['USDC']}];
// @ts-expect-error Lightning cannot be combined with on-chain asset IDs.
const badRail: InvoiceCreate={amount:'1',payment_methods:[{chain_slug:'bitcoin',payment_rail:'lightning',asset_ids:['fixture']}]};
async function example() {
  const result = await client.createInvoice('project','store',invoice,'saved');
  const url: string = result.links.checkout;
  const amount: string = result.data.amount;
  for await (const entry of client.iterateInvoices('project')) { const id: string = entry.invoice_id; void id; }
  const checkout = new CheckoutClient('https://pay.example.com');
  await checkout.getInvoice('public-id',{signal:new AbortController().signal});
  return [url,amount];
}
const fixed: CustomTokenRegistration={chain_slug:'ethereum',contract_address:'contract',name:'Token',symbol:'TOK',price_usd:'0.25'};
const dex: CustomTokenRegistration={chain_slug:'ethereum',contract_address:'contract',name:'Token',symbol:'TOK',price_mode:'dex',dex_pair_address:'pool'};
// @ts-expect-error Amounts must not be binary floating-point numbers.
const bad: InvoiceCreate={amount:1.25};
// @ts-expect-error Fixed and DEX prices must not be mixed.
const mixed: CustomTokenRegistration={...dex,price_usd:'1'};
// @ts-expect-error Inherit strategy rejects explicit confirmation overrides.
client.updateStoreConfirmationPolicy('project','store','asset',{strategy:'inherit',required_confirmations:1});
// @ts-expect-error No TLS verification bypass option.
new Client('https://api.example.com','fixture',{rejectUnauthorized:false});
const notice=parseNotification(Buffer.from('{}'),{},'fixture');
const sequence: string=notice.sequence;
// @ts-expect-error Signed notification fields are readonly.
notice.payload.status='settled';
void [example,fixed,dex,bad,mixed,sequence,APIError,HTTPTransport];
