import { Router } from 'express';
import { pool } from '../db/pool';

export const historialRouter = Router();

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/historial?zona=atriles&desde=ISO&hasta=ISO
 * Selecciona automáticamente la resolución según el largo del rango:
 *  - <= 6h: serie de 30s (tabla `historial`, última muestra del lote).
 *  - <= 7 días: agregados de 5 minutos.
 *  - > 7 días: agregados por hora (agrupando los buckets de 5 min).
 */
historialRouter.get('/', async (req, res) => {
  const zona = String(req.query.zona ?? '');
  if (zona !== 'atriles' && zona !== 'descanso') {
    return res.status(400).json({ error: 'Parámetro "zona" debe ser atriles o descanso.' });
  }
  const desde = new Date(String(req.query.desde ?? Date.now() - SEIS_HORAS_MS));
  const hasta = new Date(String(req.query.hasta ?? Date.now()));
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
  const desde = new Date(String(req.query.desde ?? Date.now() - 24 * 60 * 60 * 1000));
  const hasta = new Date(String(req.query.hasta ?? Date.now()));
  const { rows } = await pool.query(
    `SELECT ts, humedad, temperatura, rele_encendido AS "releEncendido"
     FROM historial_crudo WHERE zona = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC`,
    [zona, desde, hasta]
  );
  res.json({ puntos: rows });
});
