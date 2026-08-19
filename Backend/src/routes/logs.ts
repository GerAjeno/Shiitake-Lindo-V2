import { Router } from 'express';
import { pool } from '../db/pool';

export const logsRouter = Router();

const CATEGORIAS_VALIDAS = ['CONFIG', 'ACTUADOR', 'SENSOR', 'SISTEMA', 'WIFI'] as const;
type CategoriaFiltro = (typeof CATEGORIAS_VALIDAS)[number];

const POR_PAGINA_VALIDOS = [30, 50, 100];

// Las categorías reales guardadas en sistema_logs no coinciden 1 a 1 con los filtros visuales:
// "SISTEMA" es un cajón de sastre que agrupa USUARIOS/ALERTA/OTA y cualquier categoría libre que
// mande el firmware vía log_dispositivo (categoría no reconocida entre las conocidas).
function condicionCategoria(categorias: CategoriaFiltro[], params: unknown[]): string {
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

// Solo lectura para todos los roles autenticados. Sin endpoint de borrado:
// la auditoría es inmutable incluso para administradores (requisito explícito del usuario).
logsRouter.get('/', async (req, res) => {
  const porPaginaSolicitado = Number(req.query.porPagina);
  const porPagina = POR_PAGINA_VALIDOS.includes(porPaginaSolicitado) ? porPaginaSolicitado : 30;
  const pagina = Math.max(1, Math.trunc(Number(req.query.pagina)) || 1);
  const offset = (pagina - 1) * porPagina;

  const categoriasSolicitadas = String(req.query.categorias ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is CategoriaFiltro => (CATEGORIAS_VALIDAS as readonly string[]).includes(c));

  const fechaRaw = req.query.fecha;
  const fecha = typeof fechaRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : null;

  const condiciones: string[] = [];
  const paramsFiltro: unknown[] = [];

  if (categoriasSolicitadas.length > 0) {
    const cond = condicionCategoria(categoriasSolicitadas, paramsFiltro);
    if (cond) condiciones.push(cond);
  }
  if (fecha) {
    paramsFiltro.push(fecha);
    // La fecha se busca en hora de Chile, no UTC (el timestamp se guarda en timestamptz).
    condiciones.push(`(ts AT TIME ZONE 'America/Santiago')::date = $${paramsFiltro.length}::date`);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const paramsSelect = [...paramsFiltro, porPagina, offset];
  const { rows: logs } = await pool.query(
    `SELECT id, categoria, nivel, mensaje,
            usuario_email AS "usuarioEmail", usuario_ip AS "usuarioIp",
            valor_anterior AS "valorAnterior", valor_nuevo AS "valorNuevo",
            ts AS timestamp
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
