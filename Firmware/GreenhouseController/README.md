# Firmware Shiitake-Lindo V2 (ESP32-S3)

Reescrito completo desde cero (ver `docs/PLAN_MIGRACION.md` en la raíz del repo). No reutiliza
ninguna clase del firmware anterior.

## Placa y configuración en Arduino IDE

- **Board**: ESP32S3 Dev Module (paquete `esp32` de Espressif, instalar desde el Boards Manager).
- **PSRAM**: `OPI PSRAM` habilitado (el ESP32-S3 N16R8 tiene 8MB, necesarios para verificar OTA en memoria antes de flashear).
- **Partition Scheme**: `Custom` usando el `partitions.csv` de esta carpeta (dos particiones OTA de 3MB cada una).
- **Flash Size**: 16MB.

## Librerías a instalar (Arduino Library Manager)

- `DHT sensor library` (Adafruit) + `Adafruit Unified Sensor` (dependencia)
- `ArduinoJson` (v7.x)
- `WebSockets` (Links2004 / arduinoWebSockets) — usado por `CloudClient`
- `Crypto` (rweather) — provee `Ed25519.h`, usado por `OtaManager` para verificar la firma del firmware

El resto (`WiFi`, `HTTPClient`, `WiFiClientSecure`, `Preferences`, `mbedtls/*`, `esp_ota_ops.h`) viene incluido en el core `esp32` de Arduino.

## Antes de compilar

Editar `Config.h` y reemplazar:
1. `WIFI_SSID_DEFAULT` / `WIFI_PASSWORD_DEFAULT` — credenciales reales del invernadero.
2. `ID_DISPOSITIVO` / `DEVICE_TOKEN` — generados con `npm run dispositivo:provisionar` en `Backend/`.
3. `OTA_PUBLIC_KEY_ED25519` — generada con `npm run ota:generar-clave` en `Backend/`.
4. `AC_ATRILES_DEVICE_ID` / `AC_ATRILES_TOKEN` / `AC_ATRILES_KEY` y los equivalentes de Descanso — obtenidos con `get_ac_credentials.sh` (ver README de la raíz del proyecto original) — y también las **IPs reales** de ambos equipos en `Tasks.cpp` (`g_acController(...)`, hoy con `"0.0.0.0"` como placeholder).

**No commitear** `Config.h` con las credenciales reales rellenas — o usar `git update-index --skip-worktree Config.h` en el servidor para evitar subirlo por accidente.

## Arquitectura

- Núcleo 1: `SensorTask` (lectura + validación de sensores, acumula lotes de historial) y `ControlTask` (histéresis + relés + comandos manuales — máxima prioridad, nunca se bloquea por red).
- Núcleo 0: `CloudTask` (WiFi + WebSocket + OTA) y `WatchdogTask` (salud de memoria + confirmación OTA).
- Todo el estado compartido entre núcleos (`g_config`, `g_telemetria`, etc.) está protegido por `g_mutexEstado` (ver `Tasks.h`/`Tasks.cpp`).

## Limitaciones conocidas (documentadas, no bloqueantes para hoy)

- Sin RTC físico: la hora depende de NTP: si se reinicia sin Internet, se pierde la hora exacta hasta reconectar (aceptado explícitamente por el usuario para esta versión).
- Descubrimiento de los AC Midea por IP estática (sin reserva DHCP posible): si el router les cambia la IP, hay que actualizar `Tasks.cpp` manualmente.
- El rollback automático de OTA depende de que el bootloader del board package tenga habilitado `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` (ver comentario en `OtaManager.h`). El reflasheo manual por USB sigue siendo el respaldo real para hoy.
