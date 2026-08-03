-- Bug: 0001_init.sql creó la tabla configuracion_zona pero nunca sembró las filas de
-- 'atriles'/'descanso'. Sin esto, GET /api/config lanza error ("Configuración de zonas
-- incompleta") y el script de migración de datos hace un UPDATE que no matchea ninguna fila
-- (falso éxito). Se siembran valores por defecto idénticos a los que ya usaba el firmware
-- (ver Shared/defaultConfig.json / Types.h) — si ya existen no se pisan.
INSERT INTO configuracion_zona (zona, humedad_minima, humedad_maxima, modo)
VALUES
    ('atriles', 75, 85, 'AUTO'),
    ('descanso', 75, 85, 'AUTO')
ON CONFLICT (zona) DO NOTHING;
