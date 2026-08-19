import { Router } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../auth/middleware';
import { calcularSha256, firmarFirmware } from '../ota/signing';
import { enviarOtaADispositivo } from '../ws/hub';

export const firmwareRouter = Router();

const FIRMWARE_DIR = process.env.FIRMWARE_DIR ?? '/data/firmware';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://shiitake.ger-cloud.cc';
const VERSIONES_A_CONSERVAR = 2;

// Express no decodifica %2F antes de matchear la ruta, así que `req.params.version` puede llegar
// con secuencias "../" después del decode — sin esta validación, `path.join(FIRMWARE_DIR, ...)`
// permite path traversal (lectura arbitraria de archivos vía la descarga, que es pública/sin auth).
const VERSION_VALIDA = /^[\w.-]+$/;
function versionSegura(version: string): boolean {
  return VERSION_VALIDA.test(version) && !version.includes('..');
}

fs.mkdirSync(FIRMWARE_DIR, { recursive: true });

firmwareRouter.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT version, descripcion, sha256, subido_por AS "subidoPor", subido_en AS "subidoEn" FROM firmwares ORDER BY subido_en DESC'
  );
  res.json(rows);
});

// Descarga pública (sin auth): el ESP32 no tiene sesión de navegador. La integridad
// la garantiza la verificación de SHA-256 + firma Ed25519 que hace el propio firmware.
firmwareRouter.get('/:version/download', (req, res) => {
  if (!versionSegura(req.params.version)) return res.status(400).json({ error: 'Versión inválida.' });
  const archivo = path.join(FIRMWARE_DIR, `${req.params.version}.bin`);
  if (!fs.existsSync(archivo)) return res.status(404).json({ error: 'Versión no encontrada.' });
  const { size } = fs.statSync(archivo);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', size); // sin esto, Node usa chunked transfer y el ESP32 no sabe el tamaño (http.getSize() = -1)
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(archivo).pipe(res);
});

firmwareRouter.post(
  '/',
  requireAuth,
  requireRole('admin'),
  express.raw({ type: '*/*', limit: '16mb' }),
  async (req, res) => {
    const version = String(req.headers['x-firmware-version'] ?? '').trim();
    // Header opcional, URI-encoded desde el frontend (los headers HTTP no admiten de forma segura
    // tildes/ñ/saltos de línea sin escapar) — antes no existía ningún lugar donde anotar qué trae
    // cada .bin, así que meses después había que adivinarlo cruzando con git/memoria.
    const descripcionRaw = req.headers['x-firmware-descripcion'];
    let descripcion: string | null = null;
    if (typeof descripcionRaw === 'string' && descripcionRaw.length > 0) {
      try {
        descripcion = decodeURIComponent(descripcionRaw).slice(0, 500);
      } catch {
        return res.status(400).json({ error: 'El header x-firmware-descripcion no es un URI-encoded válido.' });
      }
    }
    const buffer = req.body as Buffer;
    if (!version || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: 'Falta la versión (header x-firmware-version) o el binario está vacío.' });
    }
    if (!versionSegura(version)) {
      return res.status(400).json({ error: 'La versión solo puede contener letras, números, puntos, guiones y guiones bajos.' });
    }

    const sha256 = calcularSha256(buffer);
    const firma = firmarFirmware(buffer);
    const archivo = path.join(FIRMWARE_DIR, `${version}.bin`);
    fs.writeFileSync(archivo, buffer);

    await pool.query(
      `INSERT INTO firmwares (version, archivo, sha256, firma_ed25519, subido_por, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (version) DO UPDATE SET archivo = $2, sha256 = $3, firma_ed25519 = $4, subido_por = $5, subido_en = now(), descripcion = $6`,
      [version, archivo, sha256, firma, req.usuario!.email, descripcion]
    );

    // Conservar como máximo las últimas N versiones (archivo + fila en DB).
    const { rows: viejas } = await pool.query(
      'SELECT version, archivo FROM firmwares ORDER BY subido_en DESC OFFSET $1',
      [VERSIONES_A_CONSERVAR]
    );
    for (const vieja of viejas) {
      fs.rmSync(vieja.archivo, { force: true });
      await pool.query('DELETE FROM firmwares WHERE version = $1', [vieja.version]);
    }

    await pool.query(
      `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email) VALUES ('OTA', 'INFO', $1, $2)`,
      [
        `Firmware ${version} subido (sha256 ${sha256.slice(0, 12)}...)` + (descripcion ? ` — ${descripcion}` : ''),
        req.usuario!.email,
      ]
    );

    const url = `${PUBLIC_BASE_URL}/api/firmware/${version}/download`;
    const enviado = enviarOtaADispositivo({ version, url, sha256, firmaEd25519: firma, comando: 'INICIAR' });

    res.json({ success: true, url, version, sha256, dispositivoNotificado: enviado });
  }
);
