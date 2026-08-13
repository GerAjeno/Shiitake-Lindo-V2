import { Router } from 'express';
import { pool } from '../db/pool';
import { verificarPassword, hashPassword } from '../auth/local';

export const meRouter = Router();

// Cualquier usuario autenticado puede consultar su propio uid/email/rol.
meRouter.get('/', (req, res) => {
  res.json(req.usuario);
});

/**
 * Autoservicio: cualquier usuario (incluido rol "lectura") puede cambiar su propia contraseña
 * — a diferencia de PUT /api/usuarios/:uid/password (solo admin, resetea la de cualquiera sin
 * pedir la actual), acá se exige la contraseña actual para evitar que una sesión abierta y
 * desatendida permita robarle la cuenta a su dueño con un cambio silencioso.
 */
meRouter.put('/password', async (req, res) => {
  const { passwordActual, passwordNueva } = req.body as { passwordActual?: string; passwordNueva?: string };
  if (!passwordActual || !passwordNueva) {
    return res.status(400).json({ error: 'Se requiere la contraseña actual y la nueva.' });
  }
  if (passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres.' });
  }

  const { rows } = await pool.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM usuarios WHERE uid = $1',
    [req.usuario!.uid]
  );
  const hashActual = rows[0]?.password_hash;
  if (!hashActual || !(await verificarPassword(passwordActual, hashActual))) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }

  const hashNuevo = await hashPassword(passwordNueva);
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE uid = $2', [hashNuevo, req.usuario!.uid]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`${req.usuario!.email} cambió su propia contraseña`, req.usuario!.email]
  );
  res.json({ ok: true });
});
