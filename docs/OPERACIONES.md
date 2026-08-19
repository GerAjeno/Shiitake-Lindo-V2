# Operación del día a día

`docs/RUNBOOK_INFRA.md` es la puesta en marcha inicial (una sola vez). Esta página es la
referencia rápida para lo que se repite: desplegar un cambio, ver logs, revertir algo que salió
mal. Todos los comandos se corren en el servidor, parados en la carpeta del repo, salvo que se
indique lo contrario.

## Desplegar un cambio de código

```bash
git pull
docker compose -f infra/docker-compose.yml up -d --build backend frontend
```

- Si el cambio es solo de variables en `infra/.env` (sin tocar código), no hace falta `--build`:
  `docker compose -f infra/docker-compose.yml up -d backend`.
- Si el cambio agrega una migración SQL nueva en `infra/postgres/migrations/`, se aplica sola al
  arrancar el backend (`ejecutarMigraciones()` en `Backend/src/db/migrate.ts`) — no hace falta
  correrla a mano.

## Ver logs

```bash
docker compose -f infra/docker-compose.yml logs -f backend      # seguir en vivo
docker compose -f infra/docker-compose.yml logs --since 1h backend frontend
```

Los contenedores rotan logs solos (10MB × 3 archivos, ver `x-logging` en `docker-compose.yml`) —
no hace falta limpiarlos a mano.

## Ver el estado de salud de los servicios

```bash
docker compose -f infra/docker-compose.yml ps
```

`backend`/`frontend`/`postgres` tienen healthcheck propio (columna `STATUS` muestra
`healthy`/`unhealthy`) — si `caddy` está enrutando mal, revisar primero acá antes de mirar el
Caddyfile: Caddy solo arranca dependiendo de que backend/frontend estén `healthy`
(`docker-compose.yml`).

## Revertir un deploy (volver a la versión anterior del código)

```bash
git log --oneline -10          # identificar el commit bueno anterior
git checkout <commit-anterior> -- .
docker compose -f infra/docker-compose.yml up -d --build backend frontend
git checkout main -- .         # una vez confirmado que ya no hace falta seguir en el commit viejo
```

Si el commit a revertir agregó una migración SQL nueva y esa migración ya se aplicó, ver la
sección siguiente antes de hacer el rollback de código — el código viejo puede no esperar las
columnas/tablas nuevas.

## Revertir la última migración de base de datos

```bash
cd Backend
DATABASE_URL=postgres://shiitake:TU_CLAVE@localhost:5432/shiitake npm run migrate:down
```

Revierte **solo la última migración aplicada**, y solo si existe su archivo
`<nombre>.down.sql` al lado en `infra/postgres/migrations/`. No todas las migraciones tienen uno
a propósito: una migración que borra una tabla o columna con datos reales no se revierte sola sin
decidir primero qué hacer con esos datos (ver el comentario al inicio de
`Backend/src/db/migrate.ts`). Si `migrate:down` avisa que no hay `.down.sql`, leer qué hizo esa
migración específica y decidir a mano con `psql` — no hay atajo seguro para ese caso.

## Respaldo y restauración de Postgres

**Pendiente de automatizar** (sin cron ni retención todavía — ver ítems 1/28 del backlog de
mejoras). Mientras tanto, respaldo manual antes de cualquier operación riesgosa (migración grande,
`migrate:down`, etc.):

```bash
docker compose -f infra/docker-compose.yml exec postgres pg_dump -U shiitake shiitake > respaldo_$(date +%Y%m%d_%H%M).sql
```

Restaurar (sobreescribe la base actual — confirmar que es lo que se quiere antes de correrlo):

```bash
cat respaldo_20260819_0230.sql | docker compose -f infra/docker-compose.yml exec -T postgres psql -U shiitake shiitake
```

## Correr los tests del backend

```bash
cd Backend && npm test
```

Cubre la lógica de validación de configuración, el cálculo de horarios de TEMPORIZADO (la causa
de un bug real en producción — ver el test que reproduce ese caso exacto en
`src/jobs/temporizador.test.ts`), el rate limiting del hub de WebSocket y el armado de filtros de
Auditoría/Logs. No reemplaza probar en la app real (ver `docs/RUNBOOK_INFRA.md`), pero atrapa
regresiones de lógica antes de llegar a producción.

## Reiniciar un solo servicio

```bash
docker compose -f infra/docker-compose.yml restart backend
```

## Diagnóstico rápido

| Síntoma | Dónde mirar |
|---|---|
| El dashboard dice "desconectado" pero el ESP32 tiene luz | `docker compose logs backend \| grep WS` — buscar "Dispositivo conectado/desconectado" y avisos de "reemplaza a una ya activa" (dos conexiones con el mismo token) |
| Un usuario no puede loguearse | `docker compose logs backend \| grep AUTH` — cuenta suspendida, contraseña incorrecta, o bloqueo temporal por intentos fallidos (10 intentos / 15 min por IP) |
| OTA no llega al dispositivo | Confirmar `dispositivoNotificado: true` en la respuesta del panel de subida; si es `false`, el ESP32 estaba desconectado en ese momento — se aplica solo cuando reconecte |
| Gráficos de Historial vacíos | Revisar el banner de error en la página (agregado para no depender de la consola del navegador) — normalmente es un rango de fechas fuera de los topes permitidos (3 años para el gráfico, 90 días para la exportación cruda) |
