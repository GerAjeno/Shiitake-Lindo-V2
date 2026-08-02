/**
 * Aplica migraciones SQL secuenciales de infra/postgres/migrations/*.sql que aún no
 * se hayan aplicado. Se ejecuta al arrancar el backend (ver src/index.ts).
 */
import fs from 'fs';
import path from 'path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, '../../../infra/postgres/migrations');

export async function ejecutarMigraciones(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migraciones_aplicadas (
      nombre TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const archivos = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const archivo of archivos) {
    const { rows } = await pool.query('SELECT 1 FROM _migraciones_aplicadas WHERE nombre = $1', [archivo]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
    console.log(`[DB] Aplicando migración: ${archivo}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migraciones_aplicadas (nombre) VALUES ($1)', [archivo]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${archivo}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log(`[DB] Migraciones al día (${archivos.length} archivo(s) revisados).`);
}

if (require.main === module) {
  ejecutarMigraciones()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
