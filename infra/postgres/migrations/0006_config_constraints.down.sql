-- Reversión estructural pura: solo quita las restricciones, no toca ninguna fila existente.
ALTER TABLE configuracion_zona
    DROP CONSTRAINT IF EXISTS humedad_minima_menor_que_maxima,
    DROP CONSTRAINT IF EXISTS umbral_advertencia_no_mayor_que_alarma;
