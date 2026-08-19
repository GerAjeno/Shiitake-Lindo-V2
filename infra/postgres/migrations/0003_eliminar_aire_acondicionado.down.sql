-- Restaura solo la FORMA de las columnas (nullable, sin los valores que tenían antes de
-- 0003_eliminar_aire_acondicionado.sql — esos datos ya se perdieron al aplicar esa migración,
-- este down no los recupera). Sirve para volver a un esquema compatible con una versión de
-- firmware/backend anterior que todavía espera estas columnas, no para restaurar el histórico de AC.
ALTER TABLE configuracion_zona
    ADD COLUMN IF NOT EXISTS ac_modo TEXT NOT NULL DEFAULT 'AUTO' CHECK (ac_modo IN ('AUTO', 'MANUAL')),
    ADD COLUMN IF NOT EXISTS ac_temp_minima REAL NOT NULL DEFAULT 22,
    ADD COLUMN IF NOT EXISTS ac_temp_maxima REAL NOT NULL DEFAULT 26,
    ADD COLUMN IF NOT EXISTS ac_manual_encendido BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE historial
    ADD COLUMN IF NOT EXISTS ac_temp_interior REAL,
    ADD COLUMN IF NOT EXISTS ac_encendido BOOLEAN;
