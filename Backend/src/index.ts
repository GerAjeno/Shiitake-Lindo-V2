import 'dotenv/config';
import express from 'express';
import http from 'http';
import { ejecutarMigraciones } from './db/migrate';
import { requireAuth } from './auth/middleware';
import { iniciarWebSocketHub } from './ws/hub';
import { iniciarJobsPeriodicos } from './jobs/aggregate';
import { configRouter } from './routes/config';
import { historialRouter } from './routes/historial';
import { alertasRouter } from './routes/alertas';
import { logsRouter } from './routes/logs';
import { usuariosRouter } from './routes/usuarios';
import { firmwareRouter } from './routes/firmware';
import { meRouter } from './routes/me';

async function main() {
  await ejecutarMigraciones();

  const app = express();
  // Detrás de Caddy/Cloudflare Tunnel: necesario para que req.ip refleje la IP real del cliente en la auditoría.
  app.set('trust proxy', true);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // /api/firmware se monta SIN el middleware global de auth porque la descarga del .bin
  // (GET /:version/download) debe quedar pública para el ESP32, que no habla Firebase Auth.
  // El propio router protege internamente subida y listado con requireRole('admin').
  app.use('/api/firmware', firmwareRouter);

  const apiProtegida = express.Router();
  apiProtegida.use(requireAuth);
  apiProtegida.use('/config', configRouter);
  apiProtegida.use('/historial', historialRouter);
  apiProtegida.use('/alertas', alertasRouter);
  apiProtegida.use('/logs', logsRouter);
  apiProtegida.use('/usuarios', usuariosRouter);
  apiProtegida.use('/me', meRouter);
  app.use('/api', apiProtegida);

  const server = http.createServer(app);
  iniciarWebSocketHub(server);
  iniciarJobsPeriodicos();

  const PORT = Number(process.env.PORT ?? 3001);
  server.listen(PORT, () => {
    console.log(`[SISTEMA] Backend Shiitake-Lindo V2 escuchando en puerto ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[SISTEMA] Error fatal iniciando el backend:', err);
  process.exit(1);
});
