-- Reversión segura: asignacion_sensores es config editable desde la web, no arrastra historial ni
-- referencias desde otras tablas — perderla al revertir vuelve al mapeo fijo anterior en el código.
ALTER TABLE configuracion_sistema DROP COLUMN IF EXISTS asignacion_sensores;
