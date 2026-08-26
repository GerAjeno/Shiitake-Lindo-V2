import { Router } from 'express';
import { pool } from '../db/pool';
import { requireRole } from '../auth/middleware';
import { enviarConfiguracionADispositivo, difundirANavegadores } from '../ws/hub';
import type { ConfiguracionSistema, ConfiguracionZona, NombreZona } from '../shared/types';

export const configRouter = Router();

function filaAZona(fila: any): ConfiguracionZona {
  return {
    humedadMinima: fila.humedad_minima,
    humedadMaxima: fila.humedad_maxima,
    modo: fila.modo,
    humidificadorManual: fila.humidificador_manual,
    temporizadorEncendido: fila.temporizador_encendido,
    rangosHorarios: fila.rangos_horarios,
    umbralAdvertenciaMQ: fila.umbral_advertencia_mq,
    umbralAlarmaMQ: fila.umbral_alarma_mq,
  };
}

const MODOS_VALIDOS = ['AUTO', 'MANUAL', 'TEMPORIZADO'];
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Valida los valores YA FUSIONADOS (anterior + parcial recibido) antes de escribir — el endpoint
 * acepta actualizaciones parciales (COALESCE), así que no basta con validar solo lo que llegó en
 * el body, hay que validar el resultado final. Sin esto, la API aceptaba en silencio bandas de
 * humedad invertidas, modos inexistentes o umbrales de MQ135 sin sentido, y ese estado inválido se
 * reenviaba tal cual al ESP32 (que siempre gana en config, sin comparar versiones).
 */
export function validarConfiguracionZona(c: ConfiguracionZona): string | null {
  if (!MODOS_VALIDOS.includes(c.modo)) return `Modo inválido: "${c.modo}". Debe ser AUTO, MANUAL o TEMPORIZADO.`;
  if (typeof c.humedadMinima !== 'number' || typeof c.humedadMaxima !== 'number' || Number.isNaN(c.humedadMinima) || Number.isNaN(c.humedadMaxima)) {
    return 'Humedad mínima/máxima deben ser números.';
  }
  if (c.humedadMinima < 0 || c.humedadMinima > 100 || c.humedadMaxima < 0 || c.humedadMaxima > 100) {
    return 'Humedad mínima/máxima deben estar entre 0 y 100.';
  }
  if (c.humedadMinima >= c.humedadMaxima) {
    return `Humedad mínima (${c.humedadMinima}%) debe ser menor que la máxima (${c.humedadMaxima}%).`;
  }
  if (typeof c.umbralAdvertenciaMQ !== 'number' || typeof c.umbralAlarmaMQ !== 'number' || c.umbralAdvertenciaMQ < 0 || c.umbralAlarmaMQ < 0) {
    return 'Los umbrales de MQ135 deben ser números no negativos.';
  }
  if (c.umbralAdvertenciaMQ > c.umbralAlarmaMQ) {
    return 'El umbral de advertencia de MQ135 no puede ser mayor que el de alarma.';
  }
  if (!Array.isArray(c.rangosHorarios)) return 'rangosHorarios debe ser un arreglo.';
  // El firmware guarda los bloques horarios en un arreglo fijo (MAX_RANGOS_HORARIOS en Types.h del
  // ESP32) y descarta en silencio cualquier bloque de más — sin este límite, guardar un bloque de
  // más desde la web parecía funcionar pero ese horario nunca se aplicaba en el controlador real.
  // Si se sube MAX_RANGOS_HORARIOS en el firmware, este número hay que subirlo también acá.
  if (c.rangosHorarios.length > 40) return 'Máximo 40 bloques horarios por zona (límite del firmware del ESP32).';
  for (const r of c.rangosHorarios) {
    if (!r || typeof r.id !== 'string' || typeof r.habilitado !== 'boolean' || !HORA_REGEX.test(r.inicio) || !HORA_REGEX.test(r.fin)) {
      return 'Cada bloque horario debe tener id, habilitado (bool) e inicio/fin en formato HH:mm.';
    }
  }
  return null;
}

export async function obtenerConfiguracionCompleta(): Promise<ConfiguracionSistema> {
  const { rows: zonas } = await pool.query('SELECT * FROM configuracion_zona');
  const { rows: sistema } = await pool.query('SELECT * FROM configuracion_sistema WHERE id = true');
  const atriles = zonas.find((z) => z.zona === 'atriles');
  const descanso = zonas.find((z) => z.zona === 'descanso');
  if (!atriles || !descanso) throw new Error('Configuración de zonas incompleta en la base de datos.');

  return {
    atriles: filaAZona(atriles),
    descanso: filaAZona(descanso),
    intervaloConmutacionMinimoSeg: sistema[0].intervalo_conmutacion_min_seg,
    sensoresHabilitados: sistema[0].sensores_habilitados,
  };
}

configRouter.get('/', async (_req, res) => {
  res.json(await obtenerConfiguracionCompleta());
});

configRouter.put('/:zona', requireRole('admin', 'operador'), async (req, res) => {
  const zona = req.params.zona as NombreZona;
  if (zona !== 'atriles' && zona !== 'descanso') {
    return res.status(400).json({ error: 'Zona inválida. Debe ser "atriles" o "descanso".' });
  }

  const { rows: previas } = await pool.query('SELECT * FROM configuracion_zona WHERE zona = $1', [zona]);
  const anterior = previas[0] ? filaAZona(previas[0]) : null;
  if (!anterior) return res.status(404).json({ error: 'Zona no encontrada.' });

  const c: Partial<ConfiguracionZona> = req.body;
  const fusionada: ConfiguracionZona = { ...anterior, ...c };
  const errorValidacion = validarConfiguracionZona(fusionada);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  await pool.query(
    `UPDATE configuracion_zona SET
       humedad_minima = COALESCE($2, humedad_minima),
       humedad_maxima = COALESCE($3, humedad_maxima),
       modo = COALESCE($4, modo),
       humidificador_manual = COALESCE($5, humidificador_manual),
       temporizador_encendido = COALESCE($6, temporizador_encendido),
       rangos_horarios = COALESCE($7, rangos_horarios),
       umbral_advertencia_mq = COALESCE($8, umbral_advertencia_mq),
       umbral_alarma_mq = COALESCE($9, umbral_alarma_mq),
       actualizado_en = now()
     WHERE zona = $1`,
    [
      zona,
      c.humedadMinima, c.humedadMaxima, c.modo, c.humidificadorManual, c.temporizadorEncendido,
      c.rangosHorarios ? JSON.stringify(c.rangosHorarios) : null,
      c.umbralAdvertenciaMQ, c.umbralAlarmaMQ,
    ]
  );

  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email, usuario_ip, valor_anterior, valor_nuevo)
     VALUES ('CONFIGURACION', 'INFO', $1, $2, $3, $4, $5)`,
    [
      `Cambio de configuración en zona ${zona}`,
      req.usuario!.email,
      (req.ip ?? '').replace('::ffff:', ''),
      JSON.stringify(anterior),
      JSON.stringify(c),
    ]
  );

  const configuracionCompleta = await obtenerConfiguracionCompleta();
  enviarConfiguracionADispositivo(configuracionCompleta);
  difundirANavegadores({ tipo: 'configuracion', datos: configuracionCompleta });
  res.json(configuracionCompleta);
});

const CLAVES_SENSORES = ['dht1', 'dht2', 'dht3', 'dht4', 'mq1', 'mq2'] as const;

/**
 * A diferencia de PUT /:zona, este endpoint no validaba nada ni dejaba rastro en sistema_logs —
 * se podía escribir un intervalo negativo o sensoresHabilitados con forma arbitraria sin que
 * quedara registrado quién lo hizo (requisito de auditoría explícito del usuario para toda
 * escritura desde la web, ver README § Seguridad).
 */
export function validarConfiguracionSistema(intervaloConmutacionMinimoSeg: unknown, sensoresHabilitados: unknown): string | null {
  if (intervaloConmutacionMinimoSeg !== undefined) {
    if (typeof intervaloConmutacionMinimoSeg !== 'number' || !Number.isFinite(intervaloConmutacionMinimoSeg)) {
      return 'intervaloConmutacionMinimoSeg debe ser un número.';
    }
    if (intervaloConmutacionMinimoSeg < 10 || intervaloConmutacionMinimoSeg > 3600) {
      return 'intervaloConmutacionMinimoSeg debe estar entre 10 y 3600 segundos.';
    }
  }
  if (sensoresHabilitados !== undefined) {
    if (typeof sensoresHabilitados !== 'object' || sensoresHabilitados === null) {
      return 'sensoresHabilitados debe ser un objeto.';
    }
    for (const clave of Object.keys(sensoresHabilitados)) {
      if (!(CLAVES_SENSORES as readonly string[]).includes(clave)) {
        return `sensoresHabilitados tiene una clave desconocida: "${clave}".`;
      }
    }
    for (const clave of CLAVES_SENSORES) {
      const valor = (sensoresHabilitados as Record<string, unknown>)[clave];
      if (valor !== undefined && typeof valor !== 'boolean') {
        return `sensoresHabilitados.${clave} debe ser booleano.`;
      }
    }
  }
  return null;
}

configRouter.put('/', requireRole('admin', 'operador'), async (req, res) => {
  const { intervaloConmutacionMinimoSeg, sensoresHabilitados } = req.body as Partial<ConfiguracionSistema>;

  const errorValidacion = validarConfiguracionSistema(intervaloConmutacionMinimoSeg, sensoresHabilitados);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  const { rows: previas } = await pool.query('SELECT * FROM configuracion_sistema WHERE id = true');
  const anterior = previas[0];

  await pool.query(
    `UPDATE configuracion_sistema SET
       intervalo_conmutacion_min_seg = COALESCE($1, intervalo_conmutacion_min_seg),
       sensores_habilitados = COALESCE($2, sensores_habilitados),
       actualizado_en = now()
     WHERE id = true`,
    [intervaloConmutacionMinimoSeg ?? null, sensoresHabilitados ? JSON.stringify(sensoresHabilitados) : null]
  );

  await pool.query(
    `INSERT INTO sistema_logs (categoria, nivel, mensaje, usuario_email, usuario_ip, valor_anterior, valor_nuevo)
     VALUES ('CONFIGURACION', 'INFO', $1, $2, $3, $4, $5)`,
    [
      'Cambio de configuración general del sistema',
      req.usuario!.email,
      (req.ip ?? '').replace('::ffff:', ''),
      JSON.stringify({
        intervaloConmutacionMinimoSeg: anterior?.intervalo_conmutacion_min_seg,
        sensoresHabilitados: anterior?.sensores_habilitados,
      }),
      JSON.stringify({ intervaloConmutacionMinimoSeg, sensoresHabilitados }),
    ]
  );

  const configuracionCompleta = await obtenerConfiguracionCompleta();
  enviarConfiguracionADispositivo(configuracionCompleta);
  difundirANavegadores({ tipo: 'configuracion', datos: configuracionCompleta });
  res.json(configuracionCompleta);
});
