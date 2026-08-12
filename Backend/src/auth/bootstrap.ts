/**
 * @file bootstrap.ts
 * @description Garantiza que exista al menos una cuenta admin al arrancar, ahora que no hay
 * Firebase para crear la primera cuenta. Es idempotente: si ADMIN_BOOTSTRAP_EMAIL ya tiene una
 * fila en `usuarios`, no toca nada (nunca pisa una contraseña que el admin ya cambió).
 */
import crypto from 'crypto';
import { pool } from '../db/pool';
import { hashPassword } from './local';

export async function asegurarAdminInicial() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!email) {
    console.warn('[AUTH] ADMIN_BOOTSTRAP_EMAIL no está definida — no se puede garantizar una cuenta admin inicial.');
    return;
  }

  const { rows } = await pool.query('SELECT uid FROM usuarios WHERE email = $1', [email]);
  if (rows.length > 0) return; // ya existe, no se pisa contraseña ni rol.

  const passwordDefinida = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const password = passwordDefinida || crypto.randomBytes(9).toString('base64url');
  const uid = crypto.randomUUID();
  const hash = await hashPassword(password);

  await pool.query(
    'INSERT INTO usuarios (uid, email, rol, activo, password_hash) VALUES ($1, $2, $3, true, $4)',
    [uid, email, 'admin', hash]
  );

  console.log('========================================================================');
  console.log(`[AUTH] Cuenta admin inicial creada: ${email}`);
  if (!passwordDefinida) {
    console.log(`[AUTH] Contraseña generada automáticamente (cámbiala tras el primer login): ${password}`);
  }
  console.log('========================================================================');
}
