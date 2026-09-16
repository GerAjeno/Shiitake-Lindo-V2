-- Se reincorporan sensores DHT22 (GPIO 4/5, IDs "DHT1"/"DHT2") junto a los 4 SHT35-RS485 (IDs
-- "SHT1".."SHT4") porque los SHT35 de la zona Descanso dieron problemas. En vez de un mapeo fijo
-- sensor->zona, el usuario elige libremente qué 2 sensores del pool de 6 van en cada zona desde la
-- web (ej. Atriles: DHT1+SHT4, Descanso: SHT2+SHT1) — reemplaza la relación implícita
-- dht1/dht2->atriles, dht3/dht4->descanso que existía hasta ahora.
ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS asignacion_sensores JSONB NOT NULL
    DEFAULT '{"atriles":["SHT1","SHT2"],"descanso":["SHT3","SHT4"]}';
