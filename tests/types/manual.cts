import {Client, type InvoiceCreate, type InvoiceResult} from '../../dist/index.js';

const client = new Client('https://api.example.test', 'wc_fixture_not_a_real_credential');
const payload: InvoiceCreate = {amount: '10.00', currency: 'EUR'};
const response: Promise<InvoiceResult> = client.createInvoice('project', 'store', payload, 'saved-key');
// @ts-expect-error Local imports must retain exact-string amount types.
const invalid: InvoiceCreate = {amount: 10};
void [response, invalid];
