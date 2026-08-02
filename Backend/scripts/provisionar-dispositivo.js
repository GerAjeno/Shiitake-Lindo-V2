#!/usr/bin/env node
/**
 * Genera el token de autenticación del ESP32 y lo inserta (hasheado) en Postgres.
 * El token en texto plano se imprime UNA vez — cópialo al Config.h del firmware
 * (DEVICE_TOKEN) y no lo pierdas, no queda guardado en ningún otro lugar.
 *
 * Uso: DATABASE_URL=postgres://... node scripts/provisionar-dispositivo.js invernadero_principal
 */
const crypto = require('crypto');
const { Client } = require('pg');

async function main() {
  const dispositivoId = process.argv[2] || 'invernadero_principal';
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO dispositivos (id, token_hash, descripcion) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET token_hash = $2`,
    [dispositivoId, tokenHash, 'ESP32-S3 controlador principal del invernadero']
  );
  await client.end();

  console.log('✅ Dispositivo provisionado:', dispositivoId);
  console.log('');
  console.log('📋 Pega esto en Firmware/GreenhouseController/Config.h:');
  console.log('');
  console.log(`constexpr const char* ID_DISPOSITIVO = "${dispositivoId}";`);
  console.log(`constexpr const char* DEVICE_TOKEN = "${token}";`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
