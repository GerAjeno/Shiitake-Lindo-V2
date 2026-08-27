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
import { CATEGORIAS_LOG, NIVELES_LOG, TIPOS_ALERTA } from '../shared/types';
import type {
  MensajeClienteAServidor,
  MensajeServidorACliente,
  TipoComandoManual,
  ComandoManual,
} from '../shared/types';

// Ningún mensaje legítimo (telemetría, lote de historial de 30s, log/alerta puntual) se acerca a
// esto — es un tope de seguridad contra un firmware con bug o un token filtrado, no un límite
// operativo real.
const MAX_PAYLOAD_BYTES = 64 * 1024;

// Límite de mensajes por conexión: generoso para el uso normal (telemetría+sensores+historial
// cada ~30s = ~0.1 msg/s por dispositivo; un navegador humano no se acerca a esto tampoco), pero
// corta en seco un bucle de envío descontrolado antes de que llene la base de datos o la memoria.
export const LIMITE_MENSAJES = 20;
export const VENTANA_LIMITE_MS = 10 * 1000;

interface ClienteNavegador {
  ws: WebSocket;
  usuario: UsuarioAutenticado;
  vivo: boolean;
}

/** Contador de mensajes por conexión en una ventana deslizante simple (reinicia al expirar). */
export class LimitadorMensajes {
  private cuenta = 0;
  private desde = Date.now();
  private avisoEmitido = false;

  /** true si el mensaje debe procesarse; false si hay que descartarlo por exceso de tasa. */
  permitir(): boolean {
    const ahora = Date.now();
    if (ahora - this.desde > VENTANA_LIMITE_MS) {
      this.cuenta = 0;
      this.desde = ahora;
      this.avisoEmitido = false;
    }
    this.cuenta++;
    return this.cuenta <= LIMITE_MENSAJES;
  }

  /** Para no inundar los logs propios del backend: un solo aviso por ventana excedida. */
  avisarUnaVez(): boolean {
    if (this.avisoEmitido) return false;
    this.avisoEmitido = true;
    return true;
  }
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
): Promise<{ ejecutado: boolean; error?: string; sht35Lectura?: { temperaturaC: number; humedadPct: number; direccion: number } }> {
  if (!dispositivoConectado()) {
    return { ejecutado: false, error: 'El dispositivo está desconectado.' };
  }

  const orderId = uuid();
  const mensaje: ComandoManual = { orderId, comando, emitidoEn: new Date().toISOString() };

  const resultado = new Promise<{ ejecutado: boolean; error?: string; sht35Lectura?: { temperaturaC: number; humedadPct: number; direccion: number } }>((resolve) => {
    const timeout = setTimeout(() => {
      comandosPendientes.delete(orderId);
      resolve({ ejecutado: false, error: 'El dispositivo no confirmó la orden en 5 segundos.' });
    }, 5000);
    comandosPendientes.set(orderId, {
      resolver: (ack: any) => resolve({ ejecutado: !!ack.ejecutado, error: ack.error, sht35Lectura: ack.sht35Lectura }),
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
      t.ultimaActualizacion = new Date().toISOString();
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
      // El firmware es código propio y confiable, pero un typo en un `registrarAlerta(...)` nuevo
      // (agregado en un cambio futuro) antes rompía el filtrado del frontend en silencio — la fila
      // se guardaba igual, pero con un `tipo` que ninguna vista sabía interpretar. Ahora al menos
      // queda un aviso explícito en los logs del backend (`docker compose logs backend`).
      if (!(TIPOS_ALERTA as readonly string[]).includes(tipoAlerta)) {
        console.warn(`[WS] Alerta de dispositivo con tipo no reconocido: "${tipoAlerta}" (esperado uno de ${TIPOS_ALERTA.join(', ')}). Revisar CloudClient::registrarAlerta en el firmware.`);
      }
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
      // Mismo motivo que en 'alerta_dispositivo' arriba: un typo en categoria/nivel del lado del
      // firmware (o un nuevo `registrarLog(...)` con una categoría inventada) antes se guardaba
      // igual pero desaparecía de los filtros por categoría del frontend sin ningún rastro.
      if (!(CATEGORIAS_LOG as readonly string[]).includes(categoria)) {
        console.warn(`[WS] Log de dispositivo con categoría no reconocida: "${categoria}" (esperado una de ${CATEGORIAS_LOG.join(', ')}). Revisar CloudClient::registrarLog en el firmware.`);
      }
      if (!(NIVELES_LOG as readonly string[]).includes(nivel)) {
        console.warn(`[WS] Log de dispositivo con nivel no reconocido: "${nivel}" (esperado uno de ${NIVELES_LOG.join(', ')}).`);
      }
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

/**
 * Cierra de forma explícita (y avisada) una conexión de dispositivo previa que sigue abierta
 * cuando llega una nueva conexión con el mismo id — antes esto pasaba en silencio: la conexión
 * vieja quedaba huérfana (nunca se cerraba, solo dejaba de recibir tráfico) y nadie se enteraba
 * de que había dos conexiones con el mismo token disputándose el rol de "el dispositivo".
 *
 * Solo queda registrado en sistema_logs (Auditoría), no como alerta — reconectar tras un reinicio
 * o un corte de WiFi es esperable y frecuente, y generar una notificación cada vez resultaba
 * ruidoso sin aportar nada que ya no se pudiera ver revisando el log cuando hiciera falta.
 */
async function reemplazarDispositivoActivo(dispositivoId: string, nuevoWs: WebSocket) {
  if (dispositivoActivo && dispositivoActivo.ws.readyState === WebSocket.OPEN) {
    console.warn(`[WS] Nueva conexión de dispositivo "${dispositivoId}" reemplaza a una ya activa — cerrando la anterior.`);
    dispositivoActivo.ws.close(4008, 'Reemplazado por una nueva conexión con el mismo id');
    await pool.query(
      `INSERT INTO sistema_logs (categoria, nivel, mensaje) VALUES ('SISTEMA', 'ADVERTENCIA', $1)`,
      [`Se detectó una segunda conexión del dispositivo "${dispositivoId}" — la anterior fue reemplazada.`]
    );
  }
  dispositivoActivo = { id: dispositivoId, ws: nuevoWs };
}

export function iniciarWebSocketHub(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD_BYTES });

  // Detecta navegadores "zombis" (ej. una laptop que se durmió sin cerrar el socket limpio):
  // sin esto, `navegadores` solo se poda en el evento 'close', que una conexión medio-caída
  // puede no disparar nunca — el Set crecía indefinidamente hasta el próximo reinicio del backend.
  const INTERVALO_HEARTBEAT_MS = 30 * 1000;
  const intervaloHeartbeat = setInterval(() => {
    for (const cliente of navegadores) {
      if (!cliente.vivo) {
        cliente.ws.terminate();
        navegadores.delete(cliente);
        continue;
      }
      cliente.vivo = false;
      cliente.ws.ping();
    }
  }, INTERVALO_HEARTBEAT_MS);
  wss.on('close', () => clearInterval(intervaloHeartbeat));

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
      await reemplazarDispositivoActivo(dispositivoId, ws);

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

      const limitador = new LimitadorMensajes();
      ws.on('message', (data) => {
        if (!limitador.permitir()) {
          if (limitador.avisarUnaVez()) {
            console.warn(`[WS] Dispositivo "${dispositivoId}" superó ${LIMITE_MENSAJES} mensajes en ${VENTANA_LIMITE_MS / 1000}s — descartando mensajes hasta que baje el ritmo.`);
          }
          return;
        }
        manejarMensajeDispositivo(dispositivoId, data.toString());
      });
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
        const cliente: ClienteNavegador = { ws, usuario, vivo: true };
        navegadores.add(cliente);
        console.log(`[WS] Navegador conectado: ${usuario.email} (${usuario.rol})`);
        ws.on('pong', () => { cliente.vivo = true; });

        const limitador = new LimitadorMensajes();
        ws.on('message', async (data) => {
          if (!limitador.permitir()) {
            if (limitador.avisarUnaVez()) {
              console.warn(`[WS] Navegador "${usuario.email}" superó ${LIMITE_MENSAJES} mensajes en ${VENTANA_LIMITE_MS / 1000}s — descartando mensajes hasta que baje el ritmo.`);
            }
            return;
          }
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
          const c = mensaje.datos as unknown as {
            tipo?: unknown; zona?: unknown; encender?: unknown;
            direccionActual?: unknown; nuevaDireccion?: unknown;
          };
          // Id generado por el navegador para correlacionar la respuesta con el comando que la
          // originó (puede haber más de uno en vuelo: cada tarjeta de zona tiene su propio botón).
          const clienteOrderId = typeof mensaje.clienteOrderId === 'string' ? mensaje.clienteOrderId : '';

          const esHumidificadorValido =
            c?.tipo === 'humidificador' && (c.zona === 'atriles' || c.zona === 'descanso') && typeof c.encender === 'boolean';
          // TEMPORAL: ver TipoComandoManual['sht35_asignar_direccion'/'sht35_leer_direccion'] en Shared/types.ts.
          const esSht35AsignarValido =
            c?.tipo === 'sht35_asignar_direccion' &&
            typeof c.direccionActual === 'number' && c.direccionActual >= 1 && c.direccionActual <= 247 &&
            typeof c.nuevaDireccion === 'number' && c.nuevaDireccion >= 1 && c.nuevaDireccion <= 247;
          const esSht35LeerValido = c?.tipo === 'sht35_leer_direccion';

          if (!esHumidificadorValido && !esSht35AsignarValido && !esSht35LeerValido) {
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
            datos: {
              orderId: clienteOrderId,
              ejecutado: resultado.ejecutado,
              error: resultado.error,
              sht35Lectura: resultado.sht35Lectura,
            },
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
