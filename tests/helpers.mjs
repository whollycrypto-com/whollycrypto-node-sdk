import {HTTPResponse} from 'whollycrypto';
export const PROJECT='11111111-1111-4111-8111-111111111111';
export const STORE='22222222-2222-4222-8222-222222222222';
export const INVOICE='33333333-3333-4333-8333-333333333333';
export const ASSET='44444444-4444-4444-8444-444444444444';
export const TOKEN='wc_fixture_not_a_real_credential';
export const reply=(data={data:[]},status=200,headers={})=>new HTTPResponse(status,{'content-type':'application/json',...headers},Buffer.from(JSON.stringify(data)));
export class FakeTransport {
  requests=[]; closed=false;
  constructor(...responses){this.responses=responses;}
  async send(request,options,signal){
    this.requests.push(request);
    if(!this.responses.length)throw Error('Unexpected extra request');
    const next=this.responses.shift();
    if(next instanceof Error)throw next;
    return typeof next==='function'?next(request,options,signal):next;
  }
  close(){this.closed=true;}
}
export function invoke(client,id,body){
  return ({
    'api-service-root':()=>client.serviceInfo(),'api-health':()=>client.health(),
    'create-invoice':()=>client.createInvoice(PROJECT,STORE,body,'saved-order-1042'),
    'get-invoice':()=>client.getInvoice(PROJECT,INVOICE),
    'list-invoice-payments':()=>client.listInvoicePayments(PROJECT,INVOICE,{limit:25,offset:0}),
    'list-invoices':()=>client.listInvoices(PROJECT,{search:'order-1042',limit:50,offset:0}),
    'list-project-payment-assets':()=>client.listProjectPaymentAssets(PROJECT),
    'update-project-payment-asset':()=>client.updateProjectPaymentAsset(PROJECT,ASSET,body),
    'list-token-candidates':()=>client.listTokenCandidates(PROJECT,'ethereum',{q:'usd',limit:10}),
    'register-token-asset':()=>client.registerTokenAsset(PROJECT,body),
    'discover-custom-dex-pools':()=>client.discoverCustomDexPools(PROJECT,'ethereum','0x'+'1'.repeat(40)),
    'register-custom-token':()=>client.registerCustomToken(PROJECT,body),
    'list-store-payment-assets':()=>client.listStorePaymentAssets(PROJECT,STORE),
    'update-store-payment-assets':()=>client.updateStorePaymentAssets(PROJECT,STORE,body.assets),
    'update-store-confirmation-policy':()=>client.updateStoreConfirmationPolicy(PROJECT,STORE,ASSET,body),
    'list-project-wallets':()=>client.listProjectWallets(PROJECT),
    'reconciliation-list':()=>client.listReconciliation(PROJECT,{status:'open',page:1}),
    'reconciliation-detail':()=>client.getReconciliation(PROJECT,INVOICE),
  })[id]();
}
