-- Defensa en profundidad: la API ya valida esto (Backend/src/routes/config.ts), pero la tabla
-- aceptaba en silencio una banda de humedad invertida o umbrales de MQ135 sin sentido si alguien
-- edita directo por psql (uso previsto para tareas administrativas en el servidor).
ALTER TABLE configuracion_zona
    ADD CONSTRAINT humedad_minima_menor_que_maxima CHECK (humedad_minima < humedad_maxima),
    ADD CONSTRAINT umbral_advertencia_no_mayor_que_alarma CHECK (umbral_advertencia_mq <= umbral_alarma_mq);
