import { NextFunction, Request, Response } from 'express';
import { verificarIdToken } from './firebase';
import { pool } from '../db/pool';
import type { RolUsuario } from '../../../Shared/types';

export interface UsuarioAutenticado {
  uid: string;
  email: string;
  rol: RolUsuario;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL;

/**
 * Busca (o auto-provisiona) el usuario en Postgres a partir de un UID de Firebase
 * ya verificado. Si el email coincide con ADMIN_BOOTSTRAP_EMAIL se le asigna admin
 * en su primer login; cualquier otro usuario nuevo entra con rol "lectura" (seguro
 * por defecto) hasta que un admin le suba el rol desde /api/usuarios.
 */
async function resolverUsuario(uid: string, email: string): Promise<UsuarioAutenticado> {
  const { rows } = await pool.query<{ uid: string; email: string; rol: RolUsuario; activo: boolean }>(
    'SELECT uid, email, rol, activo FROM usuarios WHERE uid = $1',
    [uid]
  );

  if (rows.length > 0) {
    if (!rows[0].activo) {
      throw new Error('CUENTA_SUSPENDIDA');
    }
    return { uid, email: rows[0].email, rol: rows[0].rol };
  }

  const rolInicial: RolUsuario = email === ADMIN_BOOTSTRAP_EMAIL ? 'admin' : 'lectura';
  await pool.query(
    'INSERT INTO usuarios (uid, email, rol, activo) VALUES ($1, $2, $3, true) ON CONFLICT (uid) DO NOTHING',
    [uid, email, rolInicial]
  );
  console.log(`[AUTH] Usuario nuevo auto-provisionado: ${email} -> rol ${rolInicial}`);
  return { uid, email, rol: rolInicial };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta el token de autenticación (Authorization: Bearer <token>).' });
  }

  try {
    const idToken = header.slice('Bearer '.length);
    const decoded = await verificarIdToken(idToken);
    if (!decoded.email) {
      return res.status(401).json({ error: 'El token no tiene email asociado.' });
    }
    req.usuario = await resolverUsuario(decoded.uid, decoded.email);
    next();
  } catch (err) {
    if ((err as Error).message === 'CUENTA_SUSPENDIDA') {
      return res.status(403).json({ error: 'Esta cuenta fue suspendida por un administrador.' });
    }
    console.warn('[AUTH] Token inválido:', (err as Error).message);
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

export function requireRole(...rolesPermitidos: RolUsuario[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: `Requiere rol: ${rolesPermitidos.join(' o ')}.` });
    }
    next();
  };
}

/** Verifica el ID token de Firebase enviado en la query string al abrir el WebSocket del navegador. */
export async function autenticarWebSocketNavegador(idToken: string): Promise<UsuarioAutenticado> {
  const decoded = await verificarIdToken(idToken);
  if (!decoded.email) throw new Error('Token sin email.');
  return resolverUsuario(decoded.uid, decoded.email);
}
