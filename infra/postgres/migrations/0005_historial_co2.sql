-- Se replica del sistema anterior el gráfico de "Calidad del Aire / CO2" en el histórico.
-- El firmware ya lee el valor crudo del MQ135 por zona (SensorManager::lecturaMQAtriles/Descanso
-- .valorCrudo) pero nunca se persistía en el historial, solo se enviaba el nivel categórico
-- (BAJO/MEDIO/ALTO/MUY_ALTO) en la telemetría en vivo. Requiere reflashear el ESP32 para que el
-- firmware empiece a mandarlo dentro del lote de historial (ver Tasks.cpp).
ALTER TABLE historial_crudo ADD COLUMN IF NOT EXISTS co2 REAL;
ALTER TABLE historial ADD COLUMN IF NOT EXISTS co2 REAL;

ALTER TABLE historial_agregado_5min
    ADD COLUMN IF NOT EXISTS co2_min REAL,
    ADD COLUMN IF NOT EXISTS co2_max REAL,
    ADD COLUMN IF NOT EXISTS co2_avg REAL;
