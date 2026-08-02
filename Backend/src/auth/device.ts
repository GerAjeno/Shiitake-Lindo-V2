import crypto from 'crypto';
import { pool } from '../db/pool';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Genera un token de dispositivo nuevo (usar una sola vez, al provisionar). */
export function generarTokenDispositivo(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function autenticarDispositivo(dispositivoId: string, token: string): Promise<boolean> {
  if (!dispositivoId || !token) return false;
  const { rows } = await pool.query<{ token_hash: string }>(
    'SELECT token_hash FROM dispositivos WHERE id = $1',
    [dispositivoId]
  );
  if (rows.length === 0) return false;

  const esperado = Buffer.from(rows[0].token_hash, 'hex');
  const recibido = Buffer.from(hashToken(token), 'hex');
  if (esperado.length !== recibido.length) return false;
  const valido = crypto.timingSafeEqual(esperado, recibido);

  if (valido) {
    await pool.query('UPDATE dispositivos SET ultimo_visto = now() WHERE id = $1', [dispositivoId]);
  }
  return valido;
}
