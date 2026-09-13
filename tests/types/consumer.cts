import sdk = require('whollycrypto');
const client = new sdk.Client('https://api.example.com','fixture');
const invoice: sdk.InvoiceCreate = {amount:'1.00',currency:'USD'};
const promise: Promise<sdk.InvoiceResult> = client.createInvoice('project','store',invoice,'persisted');
const version: string = sdk.VERSION;
void [promise,version];
