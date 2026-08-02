import { Router } from 'express';
import { pool } from '../db/pool';

export const logsRouter = Router();

// Solo lectura para todos los roles autenticados. Sin endpoint de borrado:
// la auditoría es inmutable incluso para administradores (requisito explícito del usuario).
logsRouter.get('/', async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 200, 1000);
  const { rows } = await pool.query('SELECT * FROM sistema_logs ORDER BY ts DESC LIMIT $1', [limite]);
  res.json(rows);
});
