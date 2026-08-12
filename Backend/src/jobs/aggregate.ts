/**
 * Job periódico: agrega la tabla `historial` (30s) en buckets de 5 minutos dentro de
 * `historial_agregado_5min` (retención indefinida, usada para rangos largos), y limpia
 * `historial_crudo` (5s) más antiguo que 90 días.
 */
import { pool } from '../db/pool';

const INTERVALO_AGREGACION_MS = 5 * 60 * 1000;
const INTERVALO_LIMPIEZA_MS = 6 * 60 * 60 * 1000;
const RETENCION_CRUDO_DIAS = 90;

async function agregarUltimoBucket() {
  await pool.query(`
    INSERT INTO historial_agregado_5min (zona, bucket, humedad_min, humedad_max, humedad_avg,
                                          temperatura_min, temperatura_max, temperatura_avg, rele_pct_encendido,
                                          co2_min, co2_max, co2_avg)
    SELECT
      zona,
      date_trunc('hour', ts) + (floor(date_part('minute', ts) / 5) * interval '5 minute') AS bucket,
      min(humedad), max(humedad), avg(humedad),
      min(temperatura), max(temperatura), avg(temperatura),
      avg(CASE WHEN rele_encendido THEN 100.0 ELSE 0.0 END),
      min(co2), max(co2), avg(co2)
    FROM historial
    WHERE ts >= now() - interval '15 minutes' AND ts < date_trunc('minute', now()) - interval '5 minutes'
    GROUP BY zona, bucket
    ON CONFLICT (zona, bucket) DO UPDATE SET
      humedad_min = EXCLUDED.humedad_min, humedad_max = EXCLUDED.humedad_max, humedad_avg = EXCLUDED.humedad_avg,
      temperatura_min = EXCLUDED.temperatura_min, temperatura_max = EXCLUDED.temperatura_max, temperatura_avg = EXCLUDED.temperatura_avg,
      rele_pct_encendido = EXCLUDED.rele_pct_encendido,
      co2_min = EXCLUDED.co2_min, co2_max = EXCLUDED.co2_max, co2_avg = EXCLUDED.co2_avg;
  `);
}

async function limpiarHistorialCrudo() {
  const { rowCount } = await pool.query(
    `DELETE FROM historial_crudo WHERE ts < now() - interval '${RETENCION_CRUDO_DIAS} days'`
  );
  if (rowCount) console.log(`[JOB] Limpieza historial_crudo: ${rowCount} filas > ${RETENCION_CRUDO_DIAS} días eliminadas.`);
}

export function iniciarJobsPeriodicos() {
  setInterval(() => agregarUltimoBucket().catch((e) => console.error('[JOB] Error agregando 5min:', e)), INTERVALO_AGREGACION_MS);
  setInterval(() => limpiarHistorialCrudo().catch((e) => console.error('[JOB] Error limpiando crudo:', e)), INTERVALO_LIMPIEZA_MS);
  console.log('[JOB] Agregación 5min y limpieza de históricos crudos programadas.');
}
