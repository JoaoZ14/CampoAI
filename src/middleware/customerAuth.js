import { AppError } from '../utils/errors.js';
import { verifyCustomerSessionToken } from '../utils/customerSession.js';

export function requireCustomerAuth(req, _res, next) {
  try {
    const hdr = String(req.headers.authorization || '');
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new AppError('Sessão ausente. Faça login.', 401);
    const session = verifyCustomerSessionToken(m[1]);
    if (!session?.sub) throw new AppError('Sessão inválida.', 401);
    req.customerSession = session;
    next();
  } catch (e) {
    next(e);
  }
}
