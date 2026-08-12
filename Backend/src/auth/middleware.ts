import { NextFunction, Request, Response } from 'express';
import { verificarSesion, NOMBRE_COOKIE_SESION } from './local';
import { pool } from '../db/pool';
import type { RolUsuario } from '../shared/types';

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

/**
 * Vuelve a leer rol/activo desde Postgres en cada request (no se confía en lo que venga
 * embebido en el JWT para eso) — así un cambio de rol o una suspensión hecha por un admin
 * toma efecto de inmediato, sin esperar a que la sesión expire (hasta 30 días).
 */
async function resolverUsuario(uid: string): Promise<UsuarioAutenticado> {
  const { rows } = await pool.query<{ uid: string; email: string; rol: RolUsuario; activo: boolean }>(
    'SELECT uid, email, rol, activo FROM usuarios WHERE uid = $1',
    [uid]
  );
  if (rows.length === 0) throw new Error('USUARIO_NO_EXISTE');
  if (!rows[0].activo) throw new Error('CUENTA_SUSPENDIDA');
  return { uid: rows[0].uid, email: rows[0].email, rol: rows[0].rol };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[NOMBRE_COOKIE_SESION];
  if (!token) {
    return res.status(401).json({ error: 'No hay sesión activa. Inicia sesión de nuevo.' });
  }

  try {
    const payload = verificarSesion(token);
    req.usuario = await resolverUsuario(payload.uid);
    next();
  } catch (err) {
    if ((err as Error).message === 'CUENTA_SUSPENDIDA') {
      return res.status(403).json({ error: 'Esta cuenta fue suspendida por un administrador.' });
    }
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
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

/**
 * Verifica la sesión del navegador al abrir el WebSocket. El token llega ya extraído de la
 * cookie `Cookie` de la petición de upgrade (ver ws/hub.ts) — no viaja por query string.
 */
export async function autenticarWebSocketNavegador(token: string): Promise<UsuarioAutenticado> {
  const payload = verificarSesion(token);
  return resolverUsuario(payload.uid);
}
