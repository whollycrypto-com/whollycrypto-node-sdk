// Server-side template: creates an account. Review before running on a real installation.
import {OperatorClient} from 'whollycrypto';
const operator = new OperatorClient(process.env.WHOLLY_API_URL, process.env.WHOLLY_OPERATOR_TOKEN);
// Persist the key AND exact body in your application before the first request.
try {
  const merchant = await operator.createMerchant({
    name:'Example shop',email:process.env.WHOLLY_NEW_ADMIN_EMAIL,
    external_id:'your-customer-1042',onboarding:'direct',
    password:process.env.WHOLLY_NEW_ADMIN_PASSWORD,require_password_change:true,
    currency:'EUR',default_timezone:'Europe/Berlin',starting_credit:'0',
  }, process.env.WHOLLY_PROVISION_REQUEST_KEY);
  console.log(merchant.merchant_id); // Never log private links or API tokens.
} finally { operator.close(); }
// Invitation alternative: onboarding:'invitation', omit password; optionally set
// send_invitation_email:true with SMTP configured. Save access_link privately once.
// Replays omit secrets; inspect the account rather than creating a new retry key.

// Recipient acceptance after their explicit custody acknowledgement:
// const onboarding = new OperatorOnboardingClient(process.env.WHOLLY_API_URL);
// await onboarding.acceptInvitation(privateToken, chosenPassword, custodyAcknowledged);
// Normal console login still requires Basic Auth and any configured TOTP.
