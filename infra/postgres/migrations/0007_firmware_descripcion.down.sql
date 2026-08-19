-- Reversión segura: descripcion es metadata opcional (changelog de texto libre) que no
-- alimenta ninguna lógica del sistema — perderla al revertir no afecta el firmware ya firmado
-- ni el historial de sha256/firma de cada versión, que quedan intactos.
ALTER TABLE firmwares DROP COLUMN IF EXISTS descripcion;
