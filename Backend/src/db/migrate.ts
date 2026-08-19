/**
 * Aplica migraciones SQL secuenciales de infra/postgres/migrations/*.sql que aún no
 * se hayan aplicado. Se ejecuta al arrancar el backend (ver src/index.ts).
 *
 * Rollback (`npm run migrate:down`, ver revertirUltimaMigracion abajo): revierte la ÚLTIMA
 * migración aplicada, y solo si existe su archivo `<nombre>.down.sql` al lado. No todas las
 * migraciones tienen uno a propósito — una migración que borra una tabla o una columna con datos
 * reales no se puede revertir de forma segura y automática sin decidir primero qué hacer con esos
 * datos, así que esos casos se dejan sin down.sql para que el operador lo revierta a mano con
 * criterio (ver docs/OPERACIONES.md).
 */
import fs from 'fs';
import path from 'path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, '../../../infra/postgres/migrations');

function listarArchivosUp(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

export async function ejecutarMigraciones(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migraciones_aplicadas (
      nombre TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const archivos = listarArchivosUp();

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

export async function revertirUltimaMigracion(): Promise<void> {
  const { rows } = await pool.query<{ nombre: string }>(
    'SELECT nombre FROM _migraciones_aplicadas ORDER BY aplicada_en DESC LIMIT 1'
  );
  if (rows.length === 0) {
    console.log('[DB] No hay migraciones aplicadas para revertir.');
    return;
  }
  const nombre = rows[0].nombre;
  const nombreDown = nombre.replace(/\.sql$/, '.down.sql');
  const rutaDown = path.join(MIGRATIONS_DIR, nombreDown);

  if (!fs.existsSync(rutaDown)) {
    throw new Error(
      `La última migración aplicada ("${nombre}") no tiene un archivo "${nombreDown}" — revertirla ` +
        'implica una decisión sobre datos reales (no solo un cambio de esquema) que no se puede automatizar ' +
        'con criterio. Revisá qué hizo la migración en infra/postgres/migrations/' +
        `${nombre} y, si corresponde, revertila a mano con psql; después borrá su fila de ` +
        '_migraciones_aplicadas para que el runner sepa que ya no está aplicada.'
    );
  }

  const sql = fs.readFileSync(rutaDown, 'utf8');
  console.log(`[DB] Revirtiendo migración: ${nombre} (usando ${nombreDown})`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM _migraciones_aplicadas WHERE nombre = $1', [nombre]);
    await client.query('COMMIT');
    console.log(`[DB] Migración revertida: ${nombre}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Falló al revertir ${nombre}: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const accion = process.argv[2] === 'down' ? revertirUltimaMigracion() : ejecutarMigraciones();
  accion
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
