-- Antes la versión subida por el panel OTA se autogeneraba como "OTA_<timestamp ISO>" y no había
-- ningún campo para anotar qué trae ese binario — meses después, no hay forma de saber qué cambió
-- en cada .bin sin cruzar con el historial de git. Ahora el admin escribe la versión real (debe
-- coincidir con FIRMWARE_VERSION en Config.h) y puede anotar un changelog corto al subir.
ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS descripcion TEXT;
