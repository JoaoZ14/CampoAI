import { publicAppBaseUrl } from '../utils/supabaseAuthUser.js';
import { linkPhoneToAuthUser } from '../services/accountLinkService.js';
import {
  addCustomerSeat,
  getCustomerDashboard,
  removeCustomerSeat,
  updateCustomerProfile,
} from '../services/customerPortalService.js';
import { findUserByAuthUserId } from '../services/userService.js';

export function handleCustomerConfig(req, res) {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return res.status(503).json({
      ok: false,
      error:
        'Configure SUPABASE_URL e SUPABASE_ANON_KEY no servidor para o login web.',
    });
  }

  const base = publicAppBaseUrl(req);
  return res.json({
    ok: true,
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    siteUrl: base,
  });
}

export async function handleCustomerMe(req, res, next) {
  try {
    const user = await findUserByAuthUserId(req.authUser.id);
    if (!user) {
      return res.json({
        ok: true,
        linked: false,
        email: req.authUser.email,
      });
    }
    const out = await getCustomerDashboard(user.id);
    res.status(200).json({ ok: true, linked: true, email: req.authUser.email, ...out });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerLinkPhone(req, res, next) {
  try {
    const out = await linkPhoneToAuthUser({
      authUserId: req.authUser.id,
      email: req.authUser.email,
      phone: req.body?.phone,
      verificationToken: req.body?.verificationToken,
    });
    res.status(200).json(out);
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerProfilePatch(req, res, next) {
  try {
    const user = await updateCustomerProfile(req.customerUser.id, req.body ?? {});
    res.status(200).json({
      ok: true,
      profile: { name: user.name, cpf: user.cpf, email: user.email, phone: user.phone },
    });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerSeatAdd(req, res, next) {
  try {
    const out = await addCustomerSeat(req.customerUser.id, req.body?.phone);
    res.status(201).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerSeatRemove(req, res, next) {
  try {
    const out = await removeCustomerSeat(req.customerUser.id, req.body?.phone);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}
