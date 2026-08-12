-- Se elimina toda compatibilidad con el aire acondicionado (Midea/Khöne) — decisión explícita
-- del usuario. El firmware ya no controla ni reporta AC; estas columnas quedaban sin uso.
ALTER TABLE configuracion_zona
    DROP COLUMN IF EXISTS ac_modo,
    DROP COLUMN IF EXISTS ac_temp_minima,
    DROP COLUMN IF EXISTS ac_temp_maxima,
    DROP COLUMN IF EXISTS ac_manual_encendido;

ALTER TABLE historial
    DROP COLUMN IF EXISTS ac_temp_interior,
    DROP COLUMN IF EXISTS ac_encendido;
