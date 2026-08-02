import fs from 'fs';
import crypto from 'crypto';

let clavePrivada: crypto.KeyObject | null = null;

function obtenerClavePrivada(): crypto.KeyObject {
  if (clavePrivada) return clavePrivada;
  const rutaClave = process.env.OTA_SIGNING_PRIVATE_KEY_PATH;
  if (!rutaClave || !fs.existsSync(rutaClave)) {
    throw new Error(
      `[OTA] No se encontró la clave de firma en OTA_SIGNING_PRIVATE_KEY_PATH="${rutaClave}". ` +
        'Generarla con: node scripts/generar-clave-ota.js'
    );
  }
  clavePrivada = crypto.createPrivateKey(fs.readFileSync(rutaClave, 'utf8'));
  return clavePrivada;
}

export function calcularSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Firma Ed25519 del binario de firmware. Retorna la firma en base64. */
export function firmarFirmware(buffer: Buffer): string {
  const firma = crypto.sign(null, buffer, obtenerClavePrivada());
  return firma.toString('base64');
}
