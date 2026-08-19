/**
 * Job periódico: evalúa los bloques horarios (rangosHorarios) de cada zona en modo TEMPORIZADO
 * contra la hora actual de Santiago y actualiza temporizador_encendido en la base de datos,
 * empujando el cambio al ESP32 y a los navegadores conectados cuando cambia.
 *
 * El ESP32 evalúa el mismo horario de forma independiente con su propio RTC (ver
 * HumidifierController::evaluarRangoHorario en el firmware) — ese es el mecanismo que realmente
 * controla el relé y el que sigue funcionando sin conexión al backend. Este job es una capa
 * adicional para que el valor en la base de datos (usado en auditoría/exportes) quede correcto
 * incluso si el dispositivo todavía corre una versión de firmware anterior a esa lógica.
 */
import { pool } from '../db/pool';
import { obtenerConfiguracionCompleta } from '../routes/config';
import { enviarConfiguracionADispositivo, difundirANavegadores } from '../ws/hub';
import type { ModoControl, NombreZona, RangoHorario } from '../shared/types';

const INTERVALO_EVALUACION_MS = 30 * 1000;
const ZONA_HORARIA = 'America/Santiago';

export function minutosDelDiaEnSantiago(ahora: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ahora);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const minuto = Number(partes.find((p) => p.type === 'minute')?.value ?? '0');
  return (hora % 24) * 60 + minuto; // formatToParts da "24" a medianoche en vez de "00"
}

export function aMinutosDelDia(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Soporta bloques que cruzan medianoche (ej. 22:00 -> 06:00). */
export function minutoEnVentana(minutoActual: number, inicio: number, fin: number): boolean {
  if (inicio <= fin) return minutoActual >= inicio && minutoActual < fin;
  return minutoActual >= inicio || minutoActual < fin;
}

export function debeEstarEncendido(rangos: RangoHorario[], minutoActual: number): boolean {
  return rangos.some((r) => {
    if (!r.habilitado) return false;
    const inicio = aMinutosDelDia(r.inicio);
    const fin = aMinutosDelDia(r.fin);
    if (inicio < 0 || fin < 0) return false;
    return minutoEnVentana(minutoActual, inicio, fin);
  });
}

async function evaluarZona(zona: NombreZona, modo: ModoControl, rangos: RangoHorario[], actual: boolean, minutoActual: number): Promise<boolean> {
  if (modo !== 'TEMPORIZADO') return false;
  const debeEncender = debeEstarEncendido(rangos, minutoActual);
  if (debeEncender === actual) return false;
  await pool.query(
    `UPDATE configuracion_zona SET temporizador_encendido = $2, actualizado_en = now() WHERE zona = $1`,
    [zona, debeEncender]
  );
  return true;
}

async function evaluarTemporizadores() {
  const config = await obtenerConfiguracionCompleta();
  const minutoActual = minutosDelDiaEnSantiago(new Date());

  const cambioAtriles = await evaluarZona('atriles', config.atriles.modo, config.atriles.rangosHorarios, config.atriles.temporizadorEncendido, minutoActual);
  const cambioDescanso = await evaluarZona('descanso', config.descanso.modo, config.descanso.rangosHorarios, config.descanso.temporizadorEncendido, minutoActual);

  if (cambioAtriles || cambioDescanso) {
    const configuracionActualizada = await obtenerConfiguracionCompleta();
    enviarConfiguracionADispositivo(configuracionActualizada);
    difundirANavegadores({ tipo: 'configuracion', datos: configuracionActualizada });
  }
}

export function iniciarJobTemporizador() {
  setInterval(() => evaluarTemporizadores().catch((e) => console.error('[JOB] Error evaluando temporizadores:', e)), INTERVALO_EVALUACION_MS);
  console.log('[JOB] Evaluación de horarios programados (TEMPORIZADO) iniciada.');
}
