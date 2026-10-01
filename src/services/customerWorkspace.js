import { farmEntitlements } from '../rural/features.js';

export function customerWorkspace(user, email) {
  const phone = (process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:/, '');
  const capabilities = farmEntitlements(user);
  return {
    linked: Boolean(user),
    email,
    name: user?.name || null,
    capabilities: {
      ...capabilities,
      reminders: capabilities.reminders && Boolean(process.env.REMINDER_CONTENT_SID?.trim()),
    },
    whatsappUrl: /^\+\d{8,15}$/.test(phone) ? `https://wa.me/${phone.slice(1)}` : null,
  };
}
