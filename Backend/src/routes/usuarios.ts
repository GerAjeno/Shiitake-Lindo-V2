import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { requireRole } from '../auth/middleware';
import { hashPassword } from '../auth/local';
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

  const { rows: existentes } = await pool.query('SELECT uid FROM usuarios WHERE email = $1', [email]);
  if (existentes.length > 0) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
  }

  const passwordTemporal = crypto.randomBytes(9).toString('base64url');
  const uid = crypto.randomUUID();
  const hash = await hashPassword(passwordTemporal);
  await pool.query('INSERT INTO usuarios (uid, email, rol, activo, password_hash) VALUES ($1, $2, $3, true, $4)', [
    uid, email, rol, hash,
  ]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Usuario creado: ${email} (rol ${rol})`, req.usuario!.email]
  );
  res.status(201).json({ uid, email, rol, passwordTemporal });
});

usuariosRouter.put('/:uid/rol', async (req, res) => {
  const { rol } = req.body as { rol: RolUsuario };
  if (!['admin', 'operador', 'lectura'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  // Un admin no puede cambiarse su propio rol — evita quedar bloqueado por accidente sin
  // ningún otro admin que pueda revertirlo.
  if (req.params.uid === req.usuario!.uid) {
    return res.status(400).json({ error: 'No podés cambiar tu propio rol.' });
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
  if (req.params.uid === req.usuario!.uid) {
    return res.status(400).json({ error: 'No podés suspender tu propia cuenta.' });
  }
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
  const hash = await hashPassword(nuevaPassword);
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE uid = $2', [hash, req.params.uid]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('USUARIOS', 'INFO', $1, $2)`,
    [`Contraseña de ${req.params.uid} cambiada por administrador`, req.usuario!.email]
  );
  res.json({ ok: true });
});
