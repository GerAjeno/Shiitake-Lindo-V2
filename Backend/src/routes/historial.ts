import { Router } from 'express';
import { pool } from '../db/pool';

export const historialRouter = Router();

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;

export function parsearRangoFechas(query: Record<string, unknown>, porDefectoDesde: number, maxRangoMs: number): { desde: Date; hasta: Date } | null {
  // Ojo acá: `new Date(String(numero))` da Invalid Date en Node (no es un formato ISO 8601
  // válido) — el bug original convertía el timestamp por defecto a string ANTES de pasarlo a
  // Date, así que el caso "sin desde/hasta en la URL" nunca funcionó (nunca se notó porque el
  // frontend siempre manda desde/hasta explícitos). new Date(numero) sí funciona: hay que
  // distinguir el caso "vino de la query string" (string) del caso "no vino" (número/Date.now()).
  const desde = query.desde !== undefined ? new Date(String(query.desde)) : new Date(Date.now() - porDefectoDesde);
  const hasta = query.hasta !== undefined ? new Date(String(query.hasta)) : new Date();
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime())) return null;
  if (desde.getTime() > hasta.getTime()) return null;
  if (hasta.getTime() - desde.getTime() > maxRangoMs) return null;
  return { desde, hasta };
}

/**
 * GET /api/historial?zona=atriles&desde=ISO&hasta=ISO
 * Selecciona automáticamente la resolución según el largo del rango:
 *  - <= 6h: serie de 30s (tabla `historial`, última muestra del lote).
 *  - <= 7 días: agregados de 5 minutos.
 *  - > 7 días: agregados por hora (agrupando los buckets de 5 min).
 */
const TRES_ANIOS_MS = 3 * 365 * 24 * 60 * 60 * 1000; // coincide con la retención acordada de `historial`

historialRouter.get('/', async (req, res) => {
  const zona = String(req.query.zona ?? '');
  if (zona !== 'atriles' && zona !== 'descanso') {
    return res.status(400).json({ error: 'Parámetro "zona" debe ser atriles o descanso.' });
  }
  const rango = parsearRangoFechas(req.query as Record<string, unknown>, SEIS_HORAS_MS, TRES_ANIOS_MS);
  if (!rango) {
    return res.status(400).json({ error: 'Rango de fechas inválido: "desde"/"hasta" deben ser fechas válidas, "desde" <= "hasta" y el rango no puede superar 3 años.' });
  }
  const { desde, hasta } = rango;
  const rangoMs = hasta.getTime() - desde.getTime();

  if (rangoMs <= SEIS_HORAS_MS) {
    const { rows } = await pool.query(
      `SELECT ts, humedad, temperatura, rele_encendido AS "releEncendido", co2
       FROM historial WHERE zona = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC`,
      [zona, desde, hasta]
    );
    return res.json({ resolucion: '30s', puntos: rows });
  }

  if (rangoMs <= SIETE_DIAS_MS) {
    const { rows } = await pool.query(
      `SELECT bucket AS ts, humedad_avg AS humedad, temperatura_avg AS temperatura,
              humedad_min, humedad_max, temperatura_min, temperatura_max,
              rele_pct_encendido AS "releEncendido",
              co2_avg AS co2, co2_min, co2_max
       FROM historial_agregado_5min WHERE zona = $1 AND bucket BETWEEN $2 AND $3 ORDER BY bucket ASC`,
      [zona, desde, hasta]
    );
    return res.json({ resolucion: '5min', puntos: rows });
  }

  const { rows } = await pool.query(
    `SELECT date_trunc('hour', bucket) AS ts,
            avg(humedad_avg) AS humedad, min(humedad_min) AS humedad_min, max(humedad_max) AS humedad_max,
            avg(temperatura_avg) AS temperatura, min(temperatura_min) AS temperatura_min, max(temperatura_max) AS temperatura_max,
            avg(rele_pct_encendido) AS "releEncendido",
            avg(co2_avg) AS co2, min(co2_min) AS co2_min, max(co2_max) AS co2_max
     FROM historial_agregado_5min WHERE zona = $1 AND bucket BETWEEN $2 AND $3
     GROUP BY 1 ORDER BY 1 ASC`,
    [zona, desde, hasta]
  );
  res.json({ resolucion: 'hora', puntos: rows });
});

/** Exportación de datos crudos de 5s (solo para exportar, no se grafican — retención 90 días). */
historialRouter.get('/crudo', async (req, res) => {
  const zona = String(req.query.zona ?? '');
  if (zona !== 'atriles' && zona !== 'descanso') {
    return res.status(400).json({ error: 'Parámetro "zona" debe ser atriles o descanso.' });
  }
  // Tope de 90 días: coincide con la retención real de historial_crudo (ver jobs/aggregate.ts) y
  // evita que un rango sin querer (ej. "desde" mal tipeado) devuelva millones de filas de golpe.
  const rango = parsearRangoFechas(req.query as Record<string, unknown>, 24 * 60 * 60 * 1000, NOVENTA_DIAS_MS);
  if (!rango) {
    return res.status(400).json({ error: 'Rango de fechas inválido: "desde"/"hasta" deben ser fechas válidas, "desde" <= "hasta" y el rango no puede superar 90 días.' });
  }
  const { desde, hasta } = rango;
  const { rows } = await pool.query(
    `SELECT ts, humedad, temperatura, rele_encendido AS "releEncendido"
     FROM historial_crudo WHERE zona = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC`,
    [zona, desde, hasta]
  );
  res.json({ puntos: rows });
});
