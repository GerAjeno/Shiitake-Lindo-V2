import { Router } from 'express';
import { pool } from '../db/pool';

export const logsRouter = Router();

const CATEGORIAS_VALIDAS = ['CONFIG', 'ACTUADOR', 'SENSOR', 'SISTEMA', 'WIFI'] as const;
type CategoriaFiltro = (typeof CATEGORIAS_VALIDAS)[number];

const POR_PAGINA_VALIDOS = [30, 50, 100];
const MAX_FILAS_EXPORT = 20000; // tope de seguridad: exportar toda la auditoría (retención indefinida) de una sola vez podría ser millones de filas.

// Las categorías reales guardadas en sistema_logs no coinciden 1 a 1 con los filtros visuales:
// "SISTEMA" es un cajón de sastre que agrupa USUARIOS/ALERTA/OTA y cualquier categoría libre que
// mande el firmware vía log_dispositivo (categoría no reconocida entre las conocidas).
export function condicionCategoria(categorias: CategoriaFiltro[], params: unknown[]): string {
  const CONOCIDAS = ['ACTUADOR', 'SENSOR', 'WIFI', 'CONFIG', 'CONFIGURACION'];
  const partes: string[] = [];
  const exactas: string[] = [];

  for (const cat of categorias) {
    if (cat === 'CONFIG') exactas.push('CONFIG', 'CONFIGURACION');
    else if (cat !== 'SISTEMA') exactas.push(cat);
  }
  if (exactas.length > 0) {
    params.push(exactas);
    partes.push(`categoria = ANY($${params.length})`);
  }
  if (categorias.includes('SISTEMA')) {
    params.push(CONOCIDAS);
    partes.push(`categoria != ALL($${params.length})`);
  }
  return partes.length > 0 ? `(${partes.join(' OR ')})` : '';
}

/** Arma el WHERE + params compartido por la lista paginada y la exportación, a partir de los
 * mismos query params (categorias/fecha/busqueda) — así ambas vistas del mismo filtro no pueden
 * desincronizarse (ej. exportar algo distinto de lo que se está viendo en pantalla). */
export function condicionesDesdeQuery(query: Record<string, unknown>): { where: string; params: unknown[] } {
  const categoriasSolicitadas = String(query.categorias ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is CategoriaFiltro => (CATEGORIAS_VALIDAS as readonly string[]).includes(c));

  const fechaRaw = query.fecha;
  const fecha = typeof fechaRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : null;

  const busquedaRaw = query.busqueda;
  const busqueda = typeof busquedaRaw === 'string' ? busquedaRaw.trim() : '';

  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (categoriasSolicitadas.length > 0) {
    const cond = condicionCategoria(categoriasSolicitadas, params);
    if (cond) condiciones.push(cond);
  }
  if (fecha) {
    params.push(fecha);
    // La fecha se busca en hora de Chile, no UTC (el timestamp se guarda en timestamptz).
    condiciones.push(`(ts AT TIME ZONE 'America/Santiago')::date = $${params.length}::date`);
  }
  if (busqueda) {
    params.push(`%${busqueda}%`);
    const p = params.length;
    condiciones.push(`(mensaje ILIKE $${p} OR categoria ILIKE $${p} OR usuario_email ILIKE $${p})`);
  }

  return { where: condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

const SELECT_CAMPOS = `id, categoria, nivel, mensaje,
       usuario_email AS "usuarioEmail", usuario_ip AS "usuarioIp",
       valor_anterior AS "valorAnterior", valor_nuevo AS "valorNuevo",
       ts AS timestamp`;

// Solo lectura para todos los roles autenticados. Sin endpoint de borrado:
// la auditoría es inmutable incluso para administradores (requisito explícito del usuario).
logsRouter.get('/', async (req, res) => {
  const porPaginaSolicitado = Number(req.query.porPagina);
  const porPagina = POR_PAGINA_VALIDOS.includes(porPaginaSolicitado) ? porPaginaSolicitado : 30;
  const pagina = Math.max(1, Math.trunc(Number(req.query.pagina)) || 1);
  const offset = (pagina - 1) * porPagina;

  const { where, params: paramsFiltro } = condicionesDesdeQuery(req.query as Record<string, unknown>);

  const paramsSelect = [...paramsFiltro, porPagina, offset];
  const { rows: logs } = await pool.query(
    `SELECT ${SELECT_CAMPOS}
     FROM sistema_logs ${where}
     ORDER BY ts DESC
     LIMIT $${paramsFiltro.length + 1} OFFSET $${paramsFiltro.length + 2}`,
    paramsSelect
  );

  const { rows: totalRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM sistema_logs ${where}`,
    paramsFiltro
  );

  res.json({ logs, total: totalRows[0].total, pagina, porPagina });
});

function csvEscapar(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Exporta a CSV los logs que cumplen el mismo filtro (categorias/fecha/busqueda) que la lista
 * paginada, hasta MAX_FILAS_EXPORT — sin esto, Auditoría/Logs era el único módulo "para mostrarle
 * a un tercero" sin forma de sacar un archivo, a diferencia de Historial. */
logsRouter.get('/export', async (req, res) => {
  const { where, params } = condicionesDesdeQuery(req.query as Record<string, unknown>);

  const { rows } = await pool.query(
    `SELECT ${SELECT_CAMPOS} FROM sistema_logs ${where} ORDER BY ts DESC LIMIT ${MAX_FILAS_EXPORT}`,
    params
  );

  const encabezado = ['Fecha', 'Categoría', 'Nivel', 'Mensaje', 'Usuario', 'IP', 'Valor anterior', 'Valor nuevo'];
  const filas = rows.map((log) =>
    [log.timestamp, log.categoria, log.nivel, log.mensaje, log.usuarioEmail ?? '', log.usuarioIp ?? '', log.valorAnterior ?? '', log.valorNuevo ?? '']
      .map(csvEscapar)
      .join(',')
  );
  const csv = '﻿' + [encabezado.map(csvEscapar).join(','), ...filas].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="logs_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
