import Client, {Client as NamedClient, CheckoutClient, parseNotification, APIError, HTTPTransport, type InvoiceCreate, type CustomTokenRegistration} from 'whollycrypto';
const client: NamedClient = new Client('https://api.example.com','fixture');
const invoice: InvoiceCreate = {amount:'1.00',currency:'EUR',checkout_appearance:{intro:'Hello',intro_font_size:18,theme:'dim',images:{logo_light:{store_id:'fixture'}},messages:{en:{paid:'Thanks'}}}};
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
