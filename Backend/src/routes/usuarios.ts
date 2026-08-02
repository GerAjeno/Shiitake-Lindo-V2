import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { requireRole } from '../auth/middleware';
import { admin } from '../auth/firebase';
import type { RolUsuario } from '../shared/types';

export const usuariosRouter = Router();

// Todo este router requiere rol admin (gestionar usuarios es exclusivo de admin, según la tabla de permisos acordada).
usuariosRouter.use(requireRole('admin'));

usuariosRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT uid, email, rol, activo, creado_en AS "creadoEn" FROM usuarios ORDER BY email');
  res.json(rows);
});

usuariosRouter.post('/', async (req, res) => {
  const { email, rol } = req.body as { email: string; rol: RolUsuario };
  if (!email || !['admin', 'operador', 'lectura'].includes(rol)) {
    return res.status(400).json({ error: 'Se requiere email y rol válido.' });
  }

  const passwordTemporal = crypto.randomBytes(9).toString('base64url');
  const usuarioFirebase = await admin.auth().createUser({ email, password: passwordTemporal });
  await pool.query('INSERT INTO usuarios (uid, email, rol, activo) VALUES ($1, $2, $3, true)', [
    usuarioFirebase.uid, email, rol,
  ]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Usuario creado: ${email} (rol ${rol})`, req.usuario!.email]
  );
  res.status(201).json({ uid: usuarioFirebase.uid, email, rol, passwordTemporal });
});

usuariosRouter.put('/:uid/rol', async (req, res) => {
  const { rol } = req.body as { rol: RolUsuario };
  if (!['admin', 'operador', 'lectura'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  await pool.query('UPDATE usuarios SET rol = $1 WHERE uid = $2', [rol, req.params.uid]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Rol de ${req.params.uid} cambiado a ${rol}`, req.usuario!.email]
  );
  res.json({ ok: true });
});

usuariosRouter.put('/:uid/activo', async (req, res) => {
  const { activo } = req.body as { activo: boolean };
  await pool.query('UPDATE usuarios SET activo = $1 WHERE uid = $2', [activo, req.params.uid]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Usuario ${req.params.uid} ${activo ? 'reactivado' : 'suspendido'}`, req.usuario!.email]
  );
  res.json({ ok: true });
});

// El admin puede cambiar directamente la contraseña de cualquier usuario (no hay recuperación por email).
usuariosRouter.put('/:uid/password', async (req, res) => {
  const { nuevaPassword } = req.body as { nuevaPassword: string };
  if (!nuevaPassword || nuevaPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  await admin.auth().updateUser(req.params.uid, { password: nuevaPassword });
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Contraseña de ${req.params.uid} cambiada por administrador`, req.usuario!.email]
  );
  res.json({ ok: true });
});
