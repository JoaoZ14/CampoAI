/**
 * Testes unitários leves do fluxo de cadastro/trial (sem banco nem Twilio).
 * Rode: node scripts/test-signup-flow.mjs
 */
import assert from 'node:assert/strict';
import {
  getTrialExpiryReason,
  hasCompletedSignup,
  isTrialExpired,
  isUsageBlocked,
} from '../src/services/userService.js';
import { getLimitReachedParts } from '../src/services/incomingMessageService.js';
import { buildSignupWelcomeBody } from '../src/services/signup/welcomeService.js';
import { buildSignupWelcomeEmail } from '../src/services/signup/signupEmailService.js';

const baseUser = {
  id: 'u1',
  phone: '+5524999999999',
  usageCount: 0,
  isPaid: false,
  organizationId: null,
  billingKind: 'free',
  subscriptionPlanCode: null,
  asaasSubscriptionStatus: null,
  billingUsageYm: null,
  billingUsageCount: 0,
  name: 'João',
  email: null,
  signupCompletedAt: null,
  trialStartedAt: null,
  trialEndsAt: null,
  welcomeSentAt: null,
  trialExpiredNotifiedAt: null,
  signupSource: null,
  createdAt: new Date().toISOString(),
};

assert.equal(hasCompletedSignup(baseUser), false);

const signedUp = {
  ...baseUser,
  signupCompletedAt: new Date().toISOString(),
  trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
};
assert.equal(hasCompletedSignup(signedUp), true);
assert.equal(getTrialExpiryReason(signedUp), null);

const expiredUsage = { ...signedUp, usageCount: 10 };
assert.equal(getTrialExpiryReason(expiredUsage), 'usage');
assert.equal(isTrialExpired(expiredUsage), true);

const expiredTime = {
  ...signedUp,
  trialEndsAt: new Date(Date.now() - 1000).toISOString(),
};
assert.equal(getTrialExpiryReason(expiredTime), 'time');

const paid = { ...expiredUsage, isPaid: true };
assert.equal(getTrialExpiryReason(paid), null);

assert.equal(
  isUsageBlocked({
    isPaid: false,
    usageCount: 0,
    monthlyAnalysisCap: null,
    monthlyAnalysisUsed: 0,
    trialExpiryReason: null,
    signupCompleted: false,
  }),
  true
);

assert.equal(
  isUsageBlocked({
    isPaid: false,
    usageCount: 2,
    monthlyAnalysisCap: null,
    monthlyAnalysisUsed: 0,
    trialExpiryReason: null,
    signupCompleted: true,
  }),
  false
);

const parts = getLimitReachedParts('+5524999999999', 'usage');
assert.ok(parts[0].includes('10 análises'));

assert.ok(buildSignupWelcomeBody('Maria Silva').includes('Maria'));

const email = buildSignupWelcomeEmail({
  name: 'Maria Silva',
  whatsappUrl: 'https://wa.me/5524999999999?text=Oi',
});
assert.ok(email.subject.includes('Maria'));
assert.ok(email.html.includes('Começar no WhatsApp'));
assert.ok(email.html.includes('https://wa.me/5524999999999'));

const emailWithoutUrl = buildSignupWelcomeEmail({ name: 'Maria Silva', whatsappUrl: '' });
assert.ok(!emailWithoutUrl.html.includes('Começar no WhatsApp'));

const waUrl = 'https://wa.me/5524999999999?text=Oi';
const emailViaOpenUrlAlias = buildSignupWelcomeEmail({
  name: 'Maria Silva',
  whatsappUrl: waUrl,
});
assert.ok(emailViaOpenUrlAlias.html.includes('Começar no WhatsApp'));

console.log('test-signup-flow: OK');
