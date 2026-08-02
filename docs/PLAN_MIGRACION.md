# Shiitake-Lindo-V2 — Reemplazo completo del sistema (migración en 1 día)

## Contexto

El sistema actual (`/mnt/Datos/Proyectos/Shitake`) tiene problemas serios y debe reemplazarse ya: credenciales reales (WiFi, admin Firebase) hardcodeadas y commiteadas en git, un endpoint de subida de firmware sin autenticación que puede flashear el ESP32 desde internet, OTA sin verificación de integridad, reacciones lentas del relé, y una arquitectura 100% dependiente de Firebase RTDB sin capa de roles ni auditoría real.

German va a reemplazarlo en una ventana de **9 horas reales**, hoy, interviniendo directamente el controlador de producción (relés de 220V, humidificador, cultivo vivo de shiitake), sin sistema viejo de respaldo corriendo en paralelo. El frontend debe verse igual para que el usuario final no note el cambio; por debajo, todo se reconstruye. Habrá una "marcha blanca" de una semana en `prueba.ger-cloud.cc` antes de promover `shiitake.ger-cloud.cc` al nuevo stack.

Estas decisiones vienen de 3 rondas de preguntas/respuestas ya cerradas con el usuario (recogidas en esta conversación). Este plan las traduce en una secuencia de trabajo ejecutable hoy, siendo honesto sobre qué cabe en 9 horas y qué no.

## Decisiones de arquitectura (resumen)

- **Repo**: nuevo, privado, en `/home/ger/Proyectos/Shiitake-Lindo-V2`, GitHub personal, rama única `main`, commits por funcionalidad terminada y probada (no por cada edición).
- **Auth**: se mantiene el proyecto Firebase existente (`invernadero-shiitake-iot`) **solo para Firebase Authentication** (mismos emails/contraseñas, cero fricción para los 5-6 usuarios). Se deja de usar Firebase RTDB por completo. El backend nuevo verifica el ID token de Firebase con `firebase-admin` (service account) y resuelve el rol (admin/operador/lectura) contra Postgres.
- **Backend**: Node.js + TypeScript, Express (REST + servidor OTA) + `ws` (WebSocket) en el mismo proceso/puerto. Sin ORM pesado: `pg` + carpeta `migrations/` con SQL secuencial aplicado al arrancar.
- **Base de datos**: PostgreSQL. Tablas: `usuarios` (uid/email/rol/activo), `configuracion` (una fila por zona, siempre sobrescrita por el servidor — **sin comparación de versiones**, gana el servidor siempre, confirmado por el usuario), `telemetria_actual`, `historial_crudo` (5s, retención 90 días), `historial` (30s, usa **la última muestra del lote** como valor representativo — no promedio/min/max, así lo pidió el usuario —, retención 3 años), `historial_agregado_5min` (indefinido, para rangos largos), `alertas`, `sistema_logs` (auditoría inmutable: usuario, IP, fecha, valor anterior/nuevo), `dispositivos` (token del ESP32).
- **Tiempo real**: un único endpoint `/ws`. Dos tipos de cliente: navegador (dashboard, autenticado con el ID token de Firebase) y el ESP32 (autenticado con un token de dispositivo propio, no Firebase). El backend hace de relay y persiste todo lo que pasa por ahí.
- **Firmware**: reescritura completa desde cero. El usuario confirmó explícitamente que el firmware actual "no funciona bien" y no quiere reutilizar ninguna clase existente — ni sensores, ni control de histéresis, ni `AcController`/`MideaLANClient`. El código actual (`/mnt/Datos/Proyectos/Shitake/Firmware`) se usa **solo como referencia técnica** para no perder conocimiento ya adquirido: mapeo de pines, el protocolo Modbus de los relés (ya confirmado además con el manual del fabricante), y el protocolo LAN/AES de Midea ya reverse-engineered (evita tener que redescubrirlo desde cero, pero sí se reimplementa la clase). Arquitectura nueva con interfaces (`ISensor`, `ITempHumiditySensor`, etc. — el patrón SOLID del proyecto anterior era bueno, se conserva el *patrón*, no el código) para poder reemplazar sensores después sin tocar el núcleo. Se escribe un `CloudClient` nuevo (HTTPS batch cada 30s + WSS persistente + poll HTTPS de respaldo si el WS cae). El driver de relés se escribe como Modbus RTU limpio (función 0x05 para escribir y **0x01 para leer confirmación de estado**, algo que el firmware actual no hace). Se añade persistencia de configuración en NVS, secuencia de arranque segura, fallback a horario si se pierde internet >30 min, hora vía NTP (sin RTC físico hoy, queda para v1.1), y OTA con checksum SHA-256 + firma Ed25519.
- **Frontend**: mismo Next.js 14 corriendo como servidor (no export estático) en el servidor. Se reutilizan visualmente casi todos los componentes actuales (`ZoneCard`, `MetricCard`, `Sidebar`, `Header`, `Footer`, gráficas Recharts, `FirmwareManager`) y se conserva `AuthContext`/`firebase.ts` tal cual (login idéntico). Solo cambian los hooks de datos (`useRealtimeData`/`useHistoricalData`): en vez de leer Firebase RTDB, hacen fetch REST + se suscriben al WebSocket del backend nuevo. Se agrega gating por rol (solo admin ve OTA, dentro de "Configuración"; solo admin/operador puede escribir).
- **Infra**: Docker Compose en una VM nueva de Proxmox (Ubuntu Server), 5 contenedores: `postgres`, `backend`, `frontend`, `caddy` (reverse proxy interno: `/api/*` y `/ws` → backend, resto → frontend), `cloudflared` (túnel hacia `prueba.ger-cloud.cc`). Reinicio automático de servicios si la VM se reinicia (`restart: unless-stopped` + systemd para Docker).
- **OTA**: el endpoint de subida ahora exige rol admin (verificación de token), calcula SHA-256 y firma Ed25519 con una clave privada que vive solo en el servidor (fuera del repo, montada como secreto en el contenedor backend). El ESP32 trae la clave pública embebida y valida antes de `Update.write()`. Se conservan como máximo las 2 últimas versiones. Firmware se considera "sano" tras 2 min sin reinicios + sensores inicializados + módulo de relés respondiendo a la lectura de estado + WiFi operativo + backend contactado al menos una vez (internet NO es requisito si todo lo local está bien). Un solo DHT caído no bloquea la validación. No hay restricción de "sin alarma crítica" ni "humidificadores apagados" para actualizar (el usuario lo pidió así).

## Fase 0 — Preparación (esto NO cuenta contra las 9 horas; el usuario lo confirmó)

Tareas que German debe dejar listas antes de empezar el cronómetro:
1. Crear la VM en Proxmox (Ubuntu Server, recomendado 4 vCPU / 8GB RAM / 60GB disco — sobra para este proyecto).
2. Instalar Docker + Docker Compose en la VM (le paso el comando de instalación oficial).
3. Crear el subdominio y túnel `prueba.ger-cloud.cc` en Cloudflare apuntando a la VM (guía paso a paso).
4. Crear el repo GitHub privado `Shiitake-Lindo-V2` (personal) y autenticar `gh`/git en este equipo (la respuesta más reciente de German confirma que ni el repo ni la autenticación existen todavía — hay que resolverlo antes de poder hacer el primer push).
5. Generar y descargar una **service account key** del proyecto Firebase existente (Project Settings → Service Accounts → Generate new private key) para que el backend pueda verificar tokens de login.
6. Confirmar que el binario `.bin` del firmware estable actual está guardado y accesible para reflashear por USB si algo sale mal (ya confirmado que sí lo tiene).

Yo preparo en paralelo, en `/home/ger/Proyectos/Shiitake-Lindo-V2`, todo el código (firmware, backend, frontend, Docker Compose, migraciones SQL, Caddyfile, script de migración de datos) para que apenas la VM esté lista, el despliegue sea `git clone && docker compose up -d --build`.

## Fase 1 — Esqueleto end-to-end (primer bloque de las 9 horas, ~60-90 min)

Objetivo: probar la cadena completa (Cloudflare → Caddy → frontend/backend → Postgres) con algo mínimo ANTES de invertir tiempo en lógica compleja, para descubrir temprano cualquier problema de infraestructura.
- Estructura de carpetas del repo (`Firmware/`, `Backend/`, `Frontend/`, `Shared/`, `infra/`).
- `docker-compose.yml` + `Dockerfile` de backend y frontend + `Caddyfile`.
- Backend mínimo: healthcheck REST, conexión a Postgres, migraciones iniciales.
- Frontend mínimo: página placeholder servida vía Next.js.
- Deploy real a `prueba.ger-cloud.cc` y verificación de que carga por HTTPS.

## Fase 2 — Firmware ESP32-S3 (reescritura completa, bloque dominante del día, ~4-4.5h)

Es el bloque de mayor riesgo y tiempo del plan porque no se reutiliza nada del código actual. Orden interno, de lo más crítico para producción a lo más aislado:
1. Núcleo de sensores desde cero: `IAirQualitySensor`/`ITempHumiditySensor` (interfaces nuevas, mismo patrón SOLID) + implementaciones DHT22 (4x) y MQ135 (2x), con los 3 filtros ya validados con el usuario (rango físico válido, salto máximo vs. mediana de últimas 5 lecturas, discrepancia entre pareja de sensores: 20 puntos humedad / 5°C temperatura), declaración de fallo tras 4 lecturas inválidas consecutivas y recuperación tras 4 válidas consecutivas.
2. Control de histéresis nuevo (`HumidifierController` reescrito): AUTO (banda mínima/máxima configurable), MANUAL, TEMPORIZADO, con el mismo anti-rebote de 120s y el mismo criterio de apagado de seguridad si ambos sensores de una zona fallan.
3. Driver de relés nuevo (`RelayModbusClient`): un solo protocolo Modbus RTU limpio (función 0x05 para escribir Canal 1/Canal 2, función 0x01 para leer confirmación de estado — el firmware actual nunca lee confirmación, esto es nuevo), reemplazando los 3 protocolos redundantes actuales.
4. `CloudClient` nuevo: HTTPS batch telemetry cada 30s, WSS persistente a `/ws`, poll HTTPS de respaldo si el WS cae, autenticación por token de dispositivo.
5. `ConfigCache`/NVS nuevo: persistir localmente todo lo necesario para arrancar sin conexión (umbrales, modo, horarios, config de AC).
6. Secuencia de arranque segura: relés apagados → cargar NVS → validar sensores → iniciar control con esa config → al conectar, pedir config al servidor y sobrescribir local (servidor siempre gana, sin comparar versiones) → continuar.
7. Fallback offline: si pasan 30+ min sin contacto exitoso con el backend, tratar el control efectivo como TEMPORIZADO con el último horario conocido (sin perder el modo que el usuario configuró, para volver a él al reconectar).
8. Hora: NTP al conectar WiFi, zona `America/Santiago` con DST automático; sin RTC físico (v1.1).
9. OTA nuevo: verificación SHA-256 + firma Ed25519 (librería `Ed25519` de Arduino), criterios de salud descritos arriba, conserva últimas 2 versiones.
10. `AcController`/cliente Midea-LAN reescrito: se reimplementa el protocolo AES/LAN de Midea usando el código actual solo como referencia de los bytes/campos ya reverse-engineered (no se copian archivos), con discovery por Device ID (sin reserva DHCP posible). Es el módulo con mayor riesgo de introducir bugs nuevos al reescribirlo bajo presión de tiempo — coincide con que el usuario ya marcó el control de AC como lo único no prioritario, así que si el tiempo aprieta esto se prueba último o se deja apagado/en modo solo-lectura para hoy.

German compila y flashea con Arduino IDE — yo entrego el código listo y la lista de librerías a instalar.

## Fase 3 — Backend (se puede solapar con Fase 2, ~2h)

- Verificación de Firebase ID token (`firebase-admin`) + resolución de rol contra `usuarios`.
- REST: `/api/config` (GET/PUT), `/api/historial`, `/api/alertas`, `/api/logs`, `/api/usuarios` (solo admin), `/api/upload-firmware` (solo admin, ahora sí protegido, firma + checksum).
- WebSocket `/ws`: canal navegador (suscripción a telemetría/config en vivo) y canal dispositivo (recepción de telemetría, envío de comandos con `orderId`, recepción de ACKs).
- Job periódico de agregación 5 minutos + limpieza de `historial_crudo` a 90 días.
- Auditoría: cada escritura desde un navegador (cambio de umbral, modo, comando manual, borrado de alerta) registra usuario, IP, fecha, valor anterior/nuevo en `sistema_logs`, inmutable incluso para admin (sin endpoint de borrado de logs).

## Fase 4 — Frontend (~1.5h)

- Copiar componentes visuales del repo actual (sin su historial git, confirmado que se puede).
- Reemplazar `useRealtimeData`/`useHistoricalData` para hablar con el backend nuevo (REST inicial + WS).
- Mantener `AuthContext`/`firebase.ts` intactos.
- Gating por rol: ocultar edición de umbrales/horarios y comandos manuales para rol "lectura"; ocultar OTA (dentro de Configuración) para todo lo que no sea admin.
- UX de comandos: mostrar "guardado" al enviar, y un segundo estado que solo pasa a "confirmado"/"error" cuando llega el ACK real del ESP32 (nunca asumir éxito sin confirmación).
- Selector de rango en históricos: última hora / 6 horas / día / semana / mes / rango personalizado, con el backend eligiendo automáticamente resolución (crudo, 30s, 5min) según el rango.

## Fase 5 — Migración de datos (~30 min)

- Usuarios: nada que migrar (Firebase Auth se conserva tal cual).
- Configuración actual (umbrales, horarios, modos) + un tramo reciente del historial (no los 3 años completos — el usuario aprobó dejar la importación completa para después): script Node de una sola vez que lee el RTDB viejo (con las credenciales que ya están en el proyecto actual) y escribe en Postgres.
- El RTDB viejo **no se borra** — queda como archivo histórico de respaldo.

## Fase 6 — Corte a producción y pruebas (con el tiempo restante)

Con el firmware ya flasheado en el dispositivo de producción y el stack corriendo en `prueba.ger-cloud.cc`, verificar en este orden (según prioridad ya definida por el usuario — todo menos el control de AC es prioritario):
1. Arranque con relés apagados y carga de config NVS.
2. Lectura de los 4 DHT y promedio por zona.
3. AUTO con histéresis (forzar humedad simulada si se puede, o esperar variación real).
4. MANUAL desde la web y confirmación de ACK del ESP32 dentro de 5s.
5. Botón físico tipo escalera sigue funcionando en paralelo (no requiere que el software lo sepa).
6. TEMPORIZADO cruzando un límite horario.
7. Corte de WiFi y reconexión (control local debe seguir funcionando).
8. Corte de backend/internet >30 min → confirmar fallback a horario.
9. Dashboard en vivo, históricos, alertas, logs con los 3 roles.
10. OTA: subida válida con firma correcta, y una subida corrupta/mal firmada (debe rechazarse).
11. Control de AC (si alcanza el tiempo — es lo único explícitamente no prioritario).

## Qué se corta primero si el tiempo se agota

Con el firmware reescrito 100% desde cero (sin reutilizar código probado), el presupuesto de 9 horas queda más ajustado que en la primera versión de este plan — la Fase 2 sola puede tomar 4-4.5h. Orden de recorte (del usuario): 1) control de AC (incluye su reescritura completa del protocolo Midea, el módulo de mayor riesgo), 2) importación completa del historial de 3 años (queda para después de hoy, solo se trae lo reciente), 3) pulido visual fino del frontend (mantener funcional aunque no sea pixel-perfect en detalles menores). Si aun así el tiempo de la Fase 6 (pruebas en vivo) queda muy corto, se prioriza validar lo que controla actuadores físicos (relés, modos AUTO/MANUAL/TEMPORIZADO, arranque seguro) por sobre dashboard/históricos, que son observables y corregibles después de puesta en marcha sin riesgo para el cultivo.

## Qué queda explícitamente para después de hoy (v1.1)

- RTC físico DS3231 (no se consigue a tiempo).
- Reemplazo de MQ135 por sensor NDIR de CO2 real (falta definir rango ppm del cultivo y elegir hardware).
- Resistencias pull-up de 4.7-10kΩ y capacitores de 100nF en los DHT22 (el usuario dijo que sí pero no hoy).
- Migración completa de los 3 años de histórico.
- Reservas DHCP para los AC Midea (o discovery automático más robusto).
- Canal estable/pruebas separado para OTA (no aplica con un solo dispositivo).

## Verificación / plan de pruebas

- Backend: pruebas manuales de cada endpoint REST + conexión WS con un cliente de prueba (`wscat` o script Node) antes de tocar el ESP32 real.
- Firmware: si el ESP32-S3 de repuesto está disponible y German quiere usarlo, hacer un smoke test rápido de WS + relés antes de flashear producción (opcional, no bloqueante — confirmó que la validación final es en producción por tiempo).
- End-to-end: checklist de la Fase 6 ejecutada en vivo con German presente físicamente junto al equipo.
- Reflasheo de emergencia: `.bin` estable anterior + cable USB listos todo el tiempo que dure la migración.

## Rollback de emergencia

Si algo falla críticamente durante las pruebas en producción: reflashear por USB el binario estable anterior (ya confirmado que existe), lo que devuelve el control físico a la lógica probada de hoy-menos-uno. El RTDB de Firebase viejo sigue intacto como referencia. `prueba.ger-cloud.cc` puede apagarse sin afectar `shiitake.ger-cloud.cc` porque el dominio de producción no se toca hasta que termine la marcha blanca de una semana.
