/**
 * @file hub.ts
 * @description Hub de WebSocket único (/ws) con dos tipos de cliente:
 *  - "navegador": el dashboard, autenticado con la cookie de sesión propia (ver auth/local.ts).
 *  - "dispositivo": el ESP32-S3, autenticado con un token propio (no depende del navegador).
 * El backend hace de relay (navegador <-> dispositivo) y persiste todo en Postgres.
 */
import http from 'http';
import { URL } from 'url';
import cookie from 'cookie';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { pool } from '../db/pool';
import { autenticarWebSocketNavegador, UsuarioAutenticado } from '../auth/middleware';
import { NOMBRE_COOKIE_SESION } from '../auth/local';
import { autenticarDispositivo } from '../auth/device';
import { obtenerConfiguracionCompleta } from '../routes/config';
import type {
  MensajeClienteAServidor,
  MensajeServidorACliente,
  TipoComandoManual,
  ComandoManual,
} from '../shared/types';

interface ClienteNavegador {
  ws: WebSocket;
  usuario: UsuarioAutenticado;
}

const navegadores = new Set<ClienteNavegador>();
let dispositivoActivo: { id: string; ws: WebSocket } | null = null;

// orderId -> callback para responder al navegador que originó el comando (timeout de 5s, ver requisito de UX)
const comandosPendientes = new Map<string, { resolver: (ack: unknown) => void; timeout: NodeJS.Timeout }>();

function enviarANavegador(cliente: ClienteNavegador, mensaje: MensajeServidorACliente) {
  if (cliente.ws.readyState === WebSocket.OPEN) cliente.ws.send(JSON.stringify(mensaje));
}

export function difundirANavegadores(mensaje: MensajeServidorACliente) {
  for (const cliente of navegadores) enviarANavegador(cliente, mensaje);
}

export function dispositivoConectado(): boolean {
  return dispositivoActivo !== null && dispositivoActivo.ws.readyState === WebSocket.OPEN;
}

/** Usado por rutas REST (ej. al guardar configuración) para avisar al ESP32 inmediatamente. */
export function enviarConfiguracionADispositivo(configuracion: unknown) {
  if (!dispositivoConectado()) return false;
  dispositivoActivo!.ws.send(JSON.stringify({ tipo: 'configuracion', datos: configuracion }));
  return true;
}

/** Usado por la ruta de subida de firmware para ordenar al ESP32 que inicie la descarga OTA. */
export function enviarOtaADispositivo(estadoOta: import('../shared/types').EstadoOta) {
  if (!dispositivoConectado()) return false;
  dispositivoActivo!.ws.send(JSON.stringify({ tipo: 'ota', datos: estadoOta }));
  return true;
}

/**
 * Envía un comando manual al ESP32 y espera su ACK real (máx. 5s, requisito explícito
 * del usuario: "si no confirma, mostrar error, nunca asumir que quedó encendido").
 */
export async function enviarComandoADispositivo(
  comando: TipoComandoManual
): Promise<{ ejecutado: boolean; error?: string }> {
  if (!dispositivoConectado()) {
    return { ejecutado: false, error: 'El dispositivo está desconectado.' };
  }

  const orderId = uuid();
  const mensaje: ComandoManual = { orderId, comando, emitidoEn: new Date().toISOString() };

  const resultado = new Promise<{ ejecutado: boolean; error?: string }>((resolve) => {
    const timeout = setTimeout(() => {
      comandosPendientes.delete(orderId);
      resolve({ ejecutado: false, error: 'El dispositivo no confirmó la orden en 5 segundos.' });
    }, 5000);
    comandosPendientes.set(orderId, {
      resolver: (ack: any) => resolve({ ejecutado: !!ack.ejecutado, error: ack.error }),
      timeout,
    });
  });

  dispositivoActivo!.ws.send(JSON.stringify({ tipo: 'comando', datos: mensaje } satisfies MensajeServidorACliente));
  return resultado;
}

async function manejarMensajeDispositivo(dispositivoId: string, raw: string) {
  let mensaje: MensajeClienteAServidor;
  try {
    mensaje = JSON.parse(raw);
  } catch {
    return;
  }

  try {
    await procesarMensajeDispositivo(dispositivoId, mensaje);
  } catch (err) {
    // Un mensaje puntual mal formado (o una query que falla) no debe tumbar la conexión del
    // dispositivo ni el proceso — se descarta ese mensaje y se sigue procesando los siguientes.
    console.error(`[WS] Error procesando mensaje '${mensaje.tipo}' del dispositivo ${dispositivoId}:`, err);
  }
}

async function procesarMensajeDispositivo(dispositivoId: string, mensaje: MensajeClienteAServidor) {
  switch (mensaje.tipo) {
    case 'telemetria': {
      const t = mensaje.datos;
      await pool.query(
        `INSERT INTO telemetria_actual (zona, datos) VALUES ('atriles', $1), ('descanso', $2)
         ON CONFLICT (zona) DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = now()`,
        [JSON.stringify(t.atriles), JSON.stringify(t.descanso)]
      );
      await pool.query(
        `INSERT INTO dispositivo_estado (dispositivo_id, estado_wifi, rssi_wifi, esp_online, firmware_version, ota_estado, ota_progreso)
         VALUES ($1, $2, $3, true, $4, $5, $6)
         ON CONFLICT (dispositivo_id) DO UPDATE SET
           estado_wifi = EXCLUDED.estado_wifi, rssi_wifi = EXCLUDED.rssi_wifi, esp_online = true,
           firmware_version = EXCLUDED.firmware_version, ota_estado = EXCLUDED.ota_estado,
           ota_progreso = EXCLUDED.ota_progreso, actualizado_en = now()`,
        [dispositivoId, t.estadoWifi, t.rssiWifi, t.firmwareVersion, t.otaEstado ?? null, t.otaProgreso ?? null]
      );
      difundirANavegadores({ tipo: 'telemetria', datos: t });
      break;
    }
    case 'sensores': {
      await pool.query(
        `INSERT INTO sensores_estado (dispositivo_id, datos) VALUES ($1, $2)
         ON CONFLICT (dispositivo_id) DO UPDATE SET datos = EXCLUDED.datos, actualizado_en = now()`,
        [dispositivoId, JSON.stringify(mensaje.datos)]
      );
      difundirANavegadores({ tipo: 'sensores', datos: mensaje.datos });
      break;
    }
    case 'historial_lote': {
      for (const lote of mensaje.datos) {
        for (const m of lote.muestras) {
          await pool.query(
            `INSERT INTO historial_crudo (zona, humedad, temperatura, rele_encendido, co2, ts) VALUES ($1,$2,$3,$4,$5,$6)`,
            [lote.zona, m.humedad, m.temperatura, m.releEncendido, m.co2 ?? null, m.ts]
          );
        }
        // Decisión explícita del usuario: la serie de 30s usa la ÚLTIMA muestra del lote, no un promedio.
        const ultima = lote.muestras[lote.muestras.length - 1];
        if (ultima) {
          await pool.query(
            `INSERT INTO historial (zona, humedad, temperatura, rele_encendido, co2, ts)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [lote.zona, ultima.humedad, ultima.temperatura, ultima.releEncendido, ultima.co2 ?? null, ultima.ts]
          );
        }
      }
      break;
    }
    case 'alerta_dispositivo': {
      const { id, tipo: tipoAlerta, mensaje: texto } = mensaje.datos;
      await pool.query(
        `INSERT INTO alertas (id, tipo, categoria, mensaje, resuelta, ts) VALUES ($1, $2, 'FIRMWARE', $3, false, now())
         ON CONFLICT (id) DO UPDATE SET tipo = EXCLUDED.tipo, mensaje = EXCLUDED.mensaje, ts = now(), resuelta = false`,
        [id, tipoAlerta, texto]
      );
      difundirANavegadores({
        tipo: 'alerta',
        datos: { id, tipo: tipoAlerta, categoria: 'FIRMWARE', mensaje: texto, resuelta: false, timestamp: new Date().toISOString() },
      });
      break;
    }
    case 'log_dispositivo': {
      const { categoria, nivel, mensaje: texto } = mensaje.datos;
      await pool.query(
        `INSERT INTO sistema_logs (categoria, nivel, mensaje) VALUES ($1, $2, $3)`,
        [categoria, nivel, texto]
      );
      break;
    }
    case 'ack': {
      const pendiente = comandosPendientes.get(mensaje.datos.orderId);
      if (pendiente) {
        clearTimeout(pendiente.timeout);
        comandosPendientes.delete(mensaje.datos.orderId);
        pendiente.resolver(mensaje.datos);
      }
      difundirANavegadores({ tipo: 'ack', datos: mensaje.datos });
      break;
    }
    default:
      break;
  }
}

export function iniciarWebSocketHub(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const tipo = url.searchParams.get('tipo');

    if (tipo === 'dispositivo') {
      const dispositivoId = url.searchParams.get('id') ?? '';
      const token = url.searchParams.get('token') ?? '';
      const ok = await autenticarDispositivo(dispositivoId, token);
      if (!ok) {
        ws.close(4001, 'Credenciales de dispositivo inválidas');
        return;
      }
      console.log(`[WS] Dispositivo conectado: ${dispositivoId}`);
      dispositivoActivo = { id: dispositivoId, ws };

      // El servidor SIEMPRE gana (decisión explícita del usuario, sin comparar versiones):
      // un dispositivo recién conectado/reiniciado debe recibir la config real de inmediato,
      // no quedarse con su NVS local hasta que alguien guarde algo desde la web.
      try {
        const configuracionActual = await obtenerConfiguracionCompleta();
        ws.send(JSON.stringify({ tipo: 'configuracion', datos: configuracionActual }));
      } catch (err) {
        console.error('[WS] No se pudo enviar configuración inicial al dispositivo:', err);
      }
      difundirANavegadores({ tipo: 'telemetria', datos: { espOnline: true } as never });

      ws.on('message', (data) => manejarMensajeDispositivo(dispositivoId, data.toString()));
      ws.on('close', async () => {
        console.log(`[WS] Dispositivo desconectado: ${dispositivoId}`);
        if (dispositivoActivo?.ws === ws) dispositivoActivo = null;
        await pool.query('UPDATE dispositivo_estado SET esp_online = false WHERE dispositivo_id = $1', [dispositivoId]);
      });
      return;
    }

    if (tipo === 'navegador') {
      const cookies = cookie.parse(req.headers.cookie ?? '');
      const token = cookies[NOMBRE_COOKIE_SESION] ?? '';
      try {
        const usuario = await autenticarWebSocketNavegador(token);
        const cliente: ClienteNavegador = { ws, usuario };
        navegadores.add(cliente);
        console.log(`[WS] Navegador conectado: ${usuario.email} (${usuario.rol})`);

        ws.on('message', async (data) => {
          let mensaje: MensajeClienteAServidor;
          try {
            mensaje = JSON.parse(data.toString());
          } catch {
            return;
          }
          if (mensaje.tipo !== 'comando') return;

          // `TipoComandoManual` es solo un tipo de TypeScript — se borra en runtime. Sin esta
          // validación, un payload arbitrario del navegador se relaya tal cual al ESP32 (que
          // confía en lo que le manda el servidor).
          const c = mensaje.datos as unknown as { tipo?: unknown; zona?: unknown; encender?: unknown };
          // Id generado por el navegador para correlacionar la respuesta con el comando que la
          // originó (puede haber más de uno en vuelo: cada tarjeta de zona tiene su propio botón).
          const clienteOrderId = typeof mensaje.clienteOrderId === 'string' ? mensaje.clienteOrderId : '';

          if (c?.tipo !== 'humidificador' || (c.zona !== 'atriles' && c.zona !== 'descanso') || typeof c.encender !== 'boolean') {
            enviarANavegador(cliente, { tipo: 'ack', datos: { orderId: clienteOrderId, ejecutado: false, error: 'Comando inválido.' } });
            return;
          }

          if (usuario.rol === 'lectura') {
            enviarANavegador(cliente, {
              tipo: 'ack',
              datos: { orderId: clienteOrderId, ejecutado: false, error: 'Tu rol es solo lectura.' },
            });
            return;
          }
          const resultado = await enviarComandoADispositivo(mensaje.datos);
          enviarANavegador(cliente, {
            tipo: 'ack',
            datos: { orderId: clienteOrderId, ejecutado: resultado.ejecutado, error: resultado.error },
          });
          await pool.query(
            `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email, usuario_ip, valor_nuevo)
             VALUES ('ACTUADOR', $1, $2, $3, $4, $5)`,
            [
              resultado.ejecutado ? 'INFO' : 'ERROR',
              `Comando manual: ${JSON.stringify(mensaje.datos)} -> ${resultado.ejecutado ? 'ejecutado' : 'falló: ' + resultado.error}`,
              usuario.email,
              (req.socket.remoteAddress ?? '').replace('::ffff:', ''),
              JSON.stringify(mensaje.datos),
            ]
          );
        });

        ws.on('close', () => navegadores.delete(cliente));
      } catch (err) {
        console.warn('[WS] Token de navegador inválido:', (err as Error).message);
        ws.close(4001, 'Token inválido');
      }
      return;
    }

    ws.close(4000, 'Falta parámetro ?tipo=navegador|dispositivo');
  });

  console.log('[WS] Hub de WebSocket activo en /ws');
  return wss;
}
