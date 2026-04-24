import {
  addCustomerSeat,
  getCustomerDashboard,
  loginCustomerByEmailPassword,
  removeCustomerSeat,
} from '../services/customerPortalService.js';

export async function handleCustomerLogin(req, res, next) {
  try {
    const out = await loginCustomerByEmailPassword(req.body?.email, req.body?.password);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerDashboard(req, res, next) {
  try {
    const out = await getCustomerDashboard(req.customerSession.sub);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerSeatAdd(req, res, next) {
  try {
    const out = await addCustomerSeat(req.customerSession.sub, req.body?.phone);
    res.status(201).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}

export async function handleCustomerSeatRemove(req, res, next) {
  try {
    const out = await removeCustomerSeat(req.customerSession.sub, req.body?.phone);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
}
