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

  const c: Partial<ConfiguracionZona> = req.body;
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

configRouter.put('/', requireRole('admin', 'operador'), async (req, res) => {
  const { intervaloConmutacionMinimoSeg, sensoresHabilitados } = req.body as Partial<ConfiguracionSistema>;
  await pool.query(
    `UPDATE configuracion_sistema SET
       intervalo_conmutacion_min_seg = COALESCE($1, intervalo_conmutacion_min_seg),
       sensores_habilitados = COALESCE($2, sensores_habilitados),
       actualizado_en = now()
     WHERE id = true`,
    [intervaloConmutacionMinimoSeg ?? null, sensoresHabilitados ? JSON.stringify(sensoresHabilitados) : null]
  );
  const configuracionCompleta = await obtenerConfiguracionCompleta();
  enviarConfiguracionADispositivo(configuracionCompleta);
  difundirANavegadores({ tipo: 'configuracion', datos: configuracionCompleta });
  res.json(configuracionCompleta);
});
