import { Router } from 'express';
import { pool } from '../db/pool';
import { verificarPassword, firmarSesion, opcionesCookieSesion, opcionesLimpiarCookieSesion, NOMBRE_COOKIE_SESION } from '../auth/local';
import type { RolUsuario } from '../shared/types';

export const authRouter = Router();

interface FilaUsuario {
  uid: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  password_hash: string | null;
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Se requiere correo y contraseña.' });
  }

  const { rows } = await pool.query<FilaUsuario>(
    'SELECT uid, email, rol, activo, password_hash FROM usuarios WHERE email = $1',
    [email]
  );
  const usuario = rows[0];

  // Mismo mensaje genérico para "no existe" y "contraseña incorrecta" — no revelar cuáles
  // correos están registrados.
  const credencialesInvalidas = () => res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

  if (!usuario || !usuario.password_hash) return credencialesInvalidas();
  if (!usuario.activo) return res.status(403).json({ error: 'Esta cuenta fue suspendida por un administrador.' });

  const passwordOk = await verificarPassword(password, usuario.password_hash);
  if (!passwordOk) return credencialesInvalidas();

  const token = firmarSesion({ uid: usuario.uid, email: usuario.email, rol: usuario.rol });
  res.cookie(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion());
  res.json({ uid: usuario.uid, email: usuario.email, rol: usuario.rol });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(NOMBRE_COOKIE_SESION, opcionesLimpiarCookieSesion());
  res.json({ ok: true });
});
