import { AppError } from '../utils/errors.js';
import { getAuthUserFromRequest } from '../utils/supabaseAuthUser.js';
import { findUserByAuthUserId } from '../services/userService.js';

/**
 * Valida JWT do Supabase Auth. Não exige linha em public.users.
 */
export async function requireCustomerAuth(req, _res, next) {
  try {
    req.authUser = await getAuthUserFromRequest(req);
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Exige conta Auth + registro em public.users vinculado (WhatsApp).
 */
export async function requireLinkedCustomer(req, _res, next) {
  try {
    if (!req.authUser) {
      req.authUser = await getAuthUserFromRequest(req);
    }
    const user = await findUserByAuthUserId(req.authUser.id);
    if (!user) {
      throw new AppError('Vincule seu WhatsApp para continuar.', 409);
    }
    req.customerUser = user;
    next();
  } catch (e) {
    next(e);
  }
}
