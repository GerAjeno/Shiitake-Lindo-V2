import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Un cliente ocioso puede fallar de forma asíncrona; no debe tumbar el proceso.
  console.error('[DB] Error inesperado en cliente idle de Postgres:', err);
});

export async function query<T = unknown>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params as never[]);
}
