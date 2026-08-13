import { Router } from 'express';
import { pool } from '../db/pool';
import { requireRole } from '../auth/middleware';

export const alertasRouter = Router();

alertasRouter.get('/', async (req, res) => {
  const soloNoResueltas = req.query.resuelta === 'false';
  // `ts` se alía a "timestamp" porque el tipo compartido Alerta (Shared/types.ts) espera ese
  // nombre — con SELECT * el campo llegaba como `ts` y el frontend mostraba "Invalid Date".
  const { rows } = await pool.query(
    soloNoResueltas
      ? 'SELECT id, tipo, categoria, mensaje, resuelta, ts AS timestamp FROM alertas WHERE resuelta = false ORDER BY ts DESC LIMIT 500'
      : 'SELECT id, tipo, categoria, mensaje, resuelta, ts AS timestamp FROM alertas ORDER BY ts DESC LIMIT 500'
  );
  res.json(rows);
});

alertasRouter.put('/:id/resolver', requireRole('admin', 'operador'), async (req, res) => {
  await pool.query('UPDATE alertas SET resuelta = true WHERE id = $1', [req.params.id]);
  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email, usuario_ip)
     VALUES ('ALERTA', 'INFO', $1, $2, $3)`,
    [`Alerta ${req.params.id} marcada como resuelta`, req.usuario!.email, (req.ip ?? '').replace('::ffff:', '')]
  );
  res.json({ ok: true });
});
