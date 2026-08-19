/**
 * @file types.ts
 * @description Tipos TypeScript compartidos entre Backend y Frontend de Shiitake-Lindo V2.
 * El firmware (C++) usa su propio Types.h, pero los nombres de campos JSON deben coincidir
 * exactamente con estas interfaces (son el contrato de la API REST y del WebSocket).
 */

export type RolUsuario = 'admin' | 'operador' | 'lectura';

export interface Usuario {
  uid: string; // uuid generado localmente al crear la cuenta (ver Backend/src/routes/usuarios.ts)
  email: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string; // ISO 8601
}

export type EstadoSensor = 'OK' | 'Offline' | 'Lectura Inválida';
export type NivelCalidadAire = 'Bajo' | 'Medio' | 'Alto' | 'Muy Alto';
export type TendenciaAire = 'Subiendo' | 'Estable' | 'Bajando';
export type ModoControl = 'AUTO' | 'MANUAL' | 'TEMPORIZADO';
export type NombreZona = 'atriles' | 'descanso';

export interface RangoHorario {
  id: string;
  inicio: string; // "HH:mm"
  fin: string; // "HH:mm"
  habilitado: boolean;
}

export interface LecturaDHT {
  estado: EstadoSensor;
  temperatura: number;
  humedad: number;
}

export interface LecturaMQ {
  estado: EstadoSensor;
  valorCrudo: number;
  nivel: NivelCalidadAire;
}

export interface MatrizSensores {
  dht1: LecturaDHT;
  dht2: LecturaDHT;
  dht3: LecturaDHT;
  dht4: LecturaDHT;
  mq1: LecturaMQ;
  mq2: LecturaMQ;
}

export interface ConfiguracionZona {
  humedadMinima: number;
  humedadMaxima: number;
  modo: ModoControl;
  humidificadorManual: boolean;
  temporizadorEncendido: boolean;
  rangosHorarios: RangoHorario[];
  umbralAdvertenciaMQ: number;
  umbralAlarmaMQ: number;
}

export interface ConfiguracionSistema {
  atriles: ConfiguracionZona;
  descanso: ConfiguracionZona;
  intervaloConmutacionMinimoSeg: number;
  sensoresHabilitados: {
    dht1: boolean; dht2: boolean; dht3: boolean; dht4: boolean;
    mq1: boolean; mq2: boolean;
  };
}

export interface TelemetriaZona {
  humedadPromedio: number | null;
  temperaturaPromedio: number | null;
  calidadAire: NivelCalidadAire;
  tendenciaAire: TendenciaAire;
  estadoHumidificador: boolean;
  modoControl: ModoControl;
  falloCriticoDHT: boolean;
}

export interface TelemetriaActual {
  atriles: TelemetriaZona;
  descanso: TelemetriaZona;
  estadoWifi: string;
  rssiWifi: number;
  espOnline: boolean;
  firmwareVersion: string;
  ultimaActualizacion: string; // ISO 8601, asignado por el backend
  otaEstado?: string;
  otaProgreso?: number;
}

export const TIPOS_ALERTA = ['INFO', 'ADVERTENCIA', 'CRITICA'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  categoria: string;
  mensaje: string;
  resuelta: boolean;
  timestamp: string;
}

/**
 * Categorías reconocidas de `sistema_logs`. Es el mismo contrato que documenta
 * `Firmware/GreenhouseController/CloudClient.h` en `registrarLog()` (el firmware, en C++, no puede
 * importar este archivo, así que ese comentario debe mantenerse en sincronía a mano con esta lista).
 * `Backend/src/ws/hub.ts` avisa por consola si el dispositivo manda una categoría fuera de esta
 * lista — antes un typo ahí rompía el filtrado del frontend en silencio, sin ningún error visible.
 */
export const CATEGORIAS_LOG = ['ACTUADOR', 'SENSOR', 'WIFI', 'CONFIG', 'CONFIGURACION', 'USUARIOS', 'ALERTA', 'OTA', 'SISTEMA', 'NUBE'] as const;
export type CategoriaLog = (typeof CATEGORIAS_LOG)[number];

export const NIVELES_LOG = ['INFO', 'ADVERTENCIA', 'ERROR', 'CRITICA'] as const;
export type NivelLog = (typeof NIVELES_LOG)[number];

export interface LogSistema {
  id: string;
  categoria: string;
  nivel: string;
  mensaje: string;
  usuarioEmail?: string;
  usuarioIp?: string;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  timestamp: string;
}

export interface RespuestaLogsPaginada {
  logs: LogSistema[];
  total: number;
  pagina: number;
  porPagina: number;
}

// ============================================================================
// Comandos manuales enviados desde la web hacia el ESP32 (vía WebSocket)
// ============================================================================
export type TipoComandoManual =
  | { tipo: 'humidificador'; zona: NombreZona; encender: boolean };

export interface ComandoManual {
  orderId: string; // uuid, generado por el backend
  comando: TipoComandoManual;
  emitidoEn: string; // ISO 8601
}

export interface AckComando {
  orderId: string;
  ejecutado: boolean;
  error?: string;
  estadoResultante?: Partial<TelemetriaActual>;
}

export interface EstadoOta {
  version: string;
  url: string;
  sha256: string;
  firmaEd25519: string;
  comando: 'ESPERA' | 'INICIAR';
}

// ============================================================================
// Mensajes del protocolo WebSocket (envelope genérico)
// ============================================================================
export type MensajeServidorACliente =
  | { tipo: 'telemetria'; datos: TelemetriaActual }
  | { tipo: 'sensores'; datos: MatrizSensores }
  | { tipo: 'configuracion'; datos: ConfiguracionSistema }
  | { tipo: 'alerta'; datos: Alerta }
  | { tipo: 'comando'; datos: ComandoManual } // servidor -> dispositivo
  | { tipo: 'ota'; datos: EstadoOta } // servidor -> dispositivo
  | { tipo: 'ack'; datos: AckComando }; // dispositivo -> servidor -> navegador

export interface MuestraCruda {
  ts: string; // ISO 8601, asignado por el ESP32 (o "ahora" si el backend la recibe con retraso de la cola offline)
  humedad: number;
  temperatura: number;
  releEncendido: boolean;
  co2?: number; // valor crudo del MQ135 de la zona (ADC); opcional por compatibilidad con firmware previo a este campo
}

/** Lote de hasta 6 muestras de 5s (30s totales) por zona, enviado cada 30s. */
export interface LoteHistorial {
  zona: NombreZona;
  muestras: MuestraCruda[];
}

/** Evento de auditoría originado por el propio ESP32 (no por una acción de un usuario en la web). */
export interface LogDispositivo {
  categoria: string; // 'ACTUADOR' | 'SENSOR' | 'WIFI' | ...
  nivel: string; // 'INFO' | 'ADVERTENCIA' | 'CRITICA'
  mensaje: string;
}

export type MensajeClienteAServidor =
  | { tipo: 'telemetria'; datos: TelemetriaActual } // dispositivo -> servidor
  | { tipo: 'sensores'; datos: MatrizSensores }
  | { tipo: 'historial_lote'; datos: LoteHistorial[] } // dispositivo -> servidor, cada 30s
  | { tipo: 'alerta_dispositivo'; datos: { id: string; tipo: TipoAlerta; mensaje: string } } // dispositivo -> servidor
  | { tipo: 'log_dispositivo'; datos: LogDispositivo } // dispositivo -> servidor
  | { tipo: 'ack'; datos: AckComando }
  // navegador -> servidor. `clienteOrderId` es un id generado por el navegador (no confundir con
  // el orderId que el backend genera para el par ComandoManual<->AckComando con el dispositivo)
  // para poder correlacionar la respuesta cuando hay más de un comando en vuelo a la vez (ej. las
  // 2 tarjetas de zona del dashboard, cada una con su propio botón).
  | { tipo: 'comando'; datos: TipoComandoManual; clienteOrderId: string };
