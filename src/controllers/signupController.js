import { completeSignup } from '../services/signup/signupService.js';
import { sendSignupOtp, verifySignupOtp } from '../services/signup/signupOtpService.js';

export async function handleSignupOtpSend(req, res, next) {
  try {
    const out = await sendSignupOtp({ phone: req.body?.phone });
    res.json(out);
  } catch (e) {
    next(e);
  }
}

export async function handleSignupOtpVerify(req, res, next) {
  try {
    const out = await verifySignupOtp({
      phone: req.body?.phone,
      code: req.body?.code,
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
}

export async function handleSignupComplete(req, res, next) {
  try {
    const body = req.body ?? {};
    const out = await completeSignup({
      name: body.name,
      phone: body.phone,
      email: body.email || req.authUser?.email,
      authUserId: req.authUser.id,
      verificationToken: body.verificationToken,
      signupSource: body.signupSource || body.origin,
    });
    res.status(201).json({
      ok: true,
      message:
        'Cadastro concluído! Abra o WhatsApp — o AG Assist já enviou uma mensagem para você começar.',
      ...out,
    });
  } catch (e) {
    next(e);
  }
}
