#!/usr/bin/env node
/**
 * Genera el par de llaves Ed25519 para firmar el firmware OTA.
 * La llave PRIVADA se queda SOLO en el servidor (infra/secrets/, fuera del repo).
 * La llave PÚBLICA se imprime en formato C (array de bytes) para pegarla en
 * Firmware/GreenhouseController/Config.h.
 *
 * Uso: node scripts/generar-clave-ota.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const secretsDir = path.join(__dirname, '..', '..', 'infra', 'secrets');
fs.mkdirSync(secretsDir, { recursive: true });

// mode: 0o600 directo en writeFileSync (no un chmodSync después) — evita la ventana donde el
// archivo existe brevemente con el umask por defecto del sistema (típicamente 644) antes de
// restringirse.
const privPath = path.join(secretsDir, 'ota-signing-key.pem');
fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

// Extraer los 32 bytes crudos de la llave pública Ed25519 (el DER de SPKI para
// Ed25519 tiene los últimos 32 bytes como la llave "raw").
const spki = publicKey.export({ type: 'spki', format: 'der' });
const rawPublicKey = spki.subarray(spki.length - 32);

const arrayC = Array.from(rawPublicKey)
  .map((b) => '0x' + b.toString(16).padStart(2, '0'))
  .join(', ');

console.log('✅ Clave privada guardada en:', privPath);
console.log('   (montarla en el contenedor backend vía OTA_SIGNING_PRIVATE_KEY_PATH, NUNCA subir al repo)');
console.log('');
console.log('📋 Pega esto en Firmware/GreenhouseController/Config.h:');
console.log('');
console.log(`constexpr uint8_t OTA_PUBLIC_KEY_ED25519[32] = { ${arrayC} };`);
