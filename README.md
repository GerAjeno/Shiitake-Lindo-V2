# Shiitake-Lindo (V2)

Reemplazo completo del sistema SCADA/IoT de invernadero de Shiitake. Ver el plan de migración completo en `docs/PLAN_MIGRACION.md`.

## Estructura

```text
Shiitake-Lindo-V2/
├── Firmware/GreenhouseController/   # Firmware ESP32-S3 (Arduino, reescrito desde cero)
├── Backend/                         # API REST + WebSocket + Postgres (Node/TypeScript)
├── Frontend/                        # Next.js 14 (SCADA web)
├── Shared/                          # Tipos TypeScript compartidos Backend/Frontend
├── infra/                           # docker-compose, Caddy, migraciones SQL
└── scripts/                         # Scripts de migración de datos y utilidades
```

## Arquitectura resumida

- **Auth**: Firebase Authentication (proyecto existente `invernadero-shiitake-iot`) solo para login. El backend verifica el ID token y resuelve el rol (`admin` / `operador` / `lectura`) contra Postgres.
- **Datos**: PostgreSQL. Sin Firebase Realtime Database.
- **Tiempo real**: WebSocket único (`/ws`) — un canal para navegadores, otro para el ESP32.
- **Firmware**: ESP32-S3, control 100% local y autónomo si se pierde Internet. Ver `Firmware/GreenhouseController/README.md`.
- **Despliegue**: Docker Compose (`infra/docker-compose.yml`) detrás de Cloudflare Tunnel.

## Desarrollo

```bash
cd Backend && npm install && npm run dev
cd Frontend && npm install && npm run dev
```

## Despliegue en el servidor

```bash
git clone <repo> && cd Shiitake-Lindo-V2
cp infra/.env.example infra/.env   # completar secretos (ver docs/PLAN_MIGRACION.md)
docker compose -f infra/docker-compose.yml up -d --build
```

## Nota de aislamiento

Este proyecto se desarrolla exclusivamente en esta sesión. No se debe mezclar con otras
carpetas o intentos paralelos (ej. `ShiitakeLindoV3`) — esa carpeta es de otra sesión no
autorizada y se ignora por completo.
