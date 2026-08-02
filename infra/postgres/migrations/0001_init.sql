-- Shiitake-Lindo V2 — esquema inicial
-- Convención: todos los timestamps se guardan en UTC (timestamptz), se convierten
-- a America/Santiago solo al mostrarlos/exportarlos en el frontend/backend.

CREATE TABLE IF NOT EXISTS usuarios (
    uid           TEXT PRIMARY KEY,          -- UID de Firebase Auth
    email         TEXT NOT NULL UNIQUE,
    rol           TEXT NOT NULL CHECK (rol IN ('admin', 'operador', 'lectura')),
    activo        BOOLEAN NOT NULL DEFAULT true,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispositivos (
    id            TEXT PRIMARY KEY,          -- ej. "invernadero_principal"
    token_hash    TEXT NOT NULL,             -- sha256 del token del dispositivo (nunca texto plano)
    descripcion   TEXT,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_visto  TIMESTAMPTZ
);

-- Una sola fila lógica por zona; el backend siempre SOBRESCRIBE (no hay merge por versión).
CREATE TABLE IF NOT EXISTS configuracion_zona (
    zona                    TEXT PRIMARY KEY CHECK (zona IN ('atriles', 'descanso')),
    humedad_minima          REAL NOT NULL,
    humedad_maxima          REAL NOT NULL,
    modo                    TEXT NOT NULL CHECK (modo IN ('AUTO', 'MANUAL', 'TEMPORIZADO')),
    humidificador_manual    BOOLEAN NOT NULL DEFAULT false,
    temporizador_encendido  BOOLEAN NOT NULL DEFAULT false,
    rangos_horarios         JSONB NOT NULL DEFAULT '[]',
    ac_modo                 TEXT NOT NULL DEFAULT 'AUTO' CHECK (ac_modo IN ('AUTO', 'MANUAL')),
    ac_temp_minima          REAL NOT NULL DEFAULT 22,
    ac_temp_maxima          REAL NOT NULL DEFAULT 26,
    ac_manual_encendido     BOOLEAN NOT NULL DEFAULT false,
    umbral_advertencia_mq   INTEGER NOT NULL DEFAULT 1500,
    umbral_alarma_mq        INTEGER NOT NULL DEFAULT 2800,
    actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracion_sistema (
    id                              BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), -- fuerza fila única
    intervalo_conmutacion_min_seg   INTEGER NOT NULL DEFAULT 120,
    sensores_habilitados            JSONB NOT NULL DEFAULT '{"dht1":true,"dht2":true,"dht3":true,"dht4":true,"mq1":true,"mq2":true}',
    actualizado_en                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO configuracion_sistema (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS telemetria_actual (
    zona                TEXT PRIMARY KEY CHECK (zona IN ('atriles', 'descanso')),
    datos               JSONB NOT NULL, -- TelemetriaZona serializado
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispositivo_estado (
    dispositivo_id      TEXT PRIMARY KEY REFERENCES dispositivos(id),
    estado_wifi         TEXT,
    rssi_wifi           INTEGER,
    esp_online          BOOLEAN NOT NULL DEFAULT false,
    firmware_version    TEXT,
    ota_estado          TEXT,
    ota_progreso        INTEGER,
    memoria_libre        INTEGER,
    tiempo_encendido_seg INTEGER,
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matriz de sensores individuales (para el panel de diagnóstico)
CREATE TABLE IF NOT EXISTS sensores_estado (
    dispositivo_id      TEXT PRIMARY KEY REFERENCES dispositivos(id),
    datos               JSONB NOT NULL, -- MatrizSensores serializado
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Datos crudos cada 5s. Retención: 90 días (job de limpieza).
CREATE TABLE IF NOT EXISTS historial_crudo (
    id              BIGSERIAL PRIMARY KEY,
    zona            TEXT NOT NULL CHECK (zona IN ('atriles', 'descanso')),
    humedad         REAL,
    temperatura     REAL,
    rele_encendido  BOOLEAN,
    ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historial_crudo_zona_ts ON historial_crudo (zona, ts DESC);

-- Series a 30s: usa la ÚLTIMA muestra del lote de 6 (decisión explícita del usuario, no promedio/min/max).
-- Retención: 3 años.
CREATE TABLE IF NOT EXISTS historial (
    id              BIGSERIAL PRIMARY KEY,
    zona            TEXT NOT NULL CHECK (zona IN ('atriles', 'descanso')),
    humedad         REAL,
    temperatura     REAL,
    rele_encendido  BOOLEAN,
    ac_temp_interior REAL,
    ac_encendido    BOOLEAN,
    ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historial_zona_ts ON historial (zona, ts DESC);

-- Agregados de 5 minutos para rangos largos (semana/mes/año). Retención indefinida.
CREATE TABLE IF NOT EXISTS historial_agregado_5min (
    zona                TEXT NOT NULL CHECK (zona IN ('atriles', 'descanso')),
    bucket              TIMESTAMPTZ NOT NULL,
    humedad_min         REAL,
    humedad_max         REAL,
    humedad_avg         REAL,
    temperatura_min     REAL,
    temperatura_max     REAL,
    temperatura_avg     REAL,
    rele_pct_encendido  REAL, -- % del bucket con el relé encendido
    PRIMARY KEY (zona, bucket)
);

-- Alertas y auditoría: indefinidas, nunca se purgan automáticamente.
CREATE TABLE IF NOT EXISTS alertas (
    id          TEXT PRIMARY KEY,
    tipo        TEXT NOT NULL CHECK (tipo IN ('INFO', 'ADVERTENCIA', 'CRITICA')),
    categoria   TEXT NOT NULL,
    mensaje     TEXT NOT NULL,
    resuelta    BOOLEAN NOT NULL DEFAULT false,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_ts ON alertas (ts DESC);

-- Auditoría inmutable: sin endpoint de borrado, ni para admin.
CREATE TABLE IF NOT EXISTS sistema_logs (
    id              BIGSERIAL PRIMARY KEY,
    categoria       TEXT NOT NULL,
    nivel           TEXT NOT NULL,
    mensaje         TEXT NOT NULL,
    usuario_email   TEXT,
    usuario_ip      TEXT,
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    ts              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sistema_logs_ts ON sistema_logs (ts DESC);

-- Firmwares publicados (para OTA firmado). Se conservan como máximo las 2 últimas versiones activas.
CREATE TABLE IF NOT EXISTS firmwares (
    version         TEXT PRIMARY KEY,
    archivo         TEXT NOT NULL,       -- ruta en disco dentro del volumen del backend
    sha256          TEXT NOT NULL,
    firma_ed25519   TEXT NOT NULL,
    subido_por      TEXT NOT NULL,       -- email del admin que subió
    subido_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
