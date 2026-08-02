import { Router } from 'express';

export const meRouter = Router();

// Cualquier usuario autenticado puede consultar su propio uid/email/rol.
meRouter.get('/', (req, res) => {
  res.json(req.usuario);
});
