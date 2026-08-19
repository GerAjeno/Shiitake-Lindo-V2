import { describe, it, expect } from 'vitest';
import { validarConfiguracionZona, validarConfiguracionSistema } from './config';
import type { ConfiguracionZona } from '../shared/types';

const zonaValida: ConfiguracionZona = {
  humedadMinima: 75,
  humedadMaxima: 85,
  modo: 'AUTO',
  humidificadorManual: false,
  temporizadorEncendido: false,
  rangosHorarios: [],
  umbralAdvertenciaMQ: 1500,
  umbralAlarmaMQ: 2800,
};

describe('validarConfiguracionZona', () => {
  it('acepta una configuración válida', () => {
    expect(validarConfiguracionZona(zonaValida)).toBeNull();
  });

  it('rechaza un modo desconocido', () => {
    expect(validarConfiguracionZona({ ...zonaValida, modo: 'FANTASIA' as any })).toMatch(/modo inválido/i);
  });

  it('rechaza humedad mínima >= máxima (antes se aceptaba en silencio)', () => {
    expect(validarConfiguracionZona({ ...zonaValida, humedadMinima: 90, humedadMaxima: 80 })).toMatch(/menor que la máxima/i);
    expect(validarConfiguracionZona({ ...zonaValida, humedadMinima: 80, humedadMaxima: 80 })).toMatch(/menor que la máxima/i);
  });

  it('rechaza humedad fuera de 0-100', () => {
    expect(validarConfiguracionZona({ ...zonaValida, humedadMinima: -1 })).toMatch(/entre 0 y 100/i);
    expect(validarConfiguracionZona({ ...zonaValida, humedadMaxima: 101 })).toMatch(/entre 0 y 100/i);
  });

  it('rechaza umbral de advertencia MQ135 mayor que el de alarma', () => {
    expect(validarConfiguracionZona({ ...zonaValida, umbralAdvertenciaMQ: 3000, umbralAlarmaMQ: 2000 })).toMatch(/advertencia.*mayor/i);
  });

  it('rechaza bloques horarios mal formados', () => {
    expect(
      validarConfiguracionZona({
        ...zonaValida,
        rangosHorarios: [{ id: '1', inicio: '25:00', fin: '10:00', habilitado: true }],
      })
    ).toMatch(/HH:mm/);
  });

  it('acepta bloques horarios válidos', () => {
    expect(
      validarConfiguracionZona({
        ...zonaValida,
        rangosHorarios: [{ id: '1', inicio: '22:00', fin: '06:00', habilitado: true }],
      })
    ).toBeNull();
  });
});

describe('validarConfiguracionSistema', () => {
  it('acepta undefined (actualización parcial sin tocar estos campos)', () => {
    expect(validarConfiguracionSistema(undefined, undefined)).toBeNull();
  });

  it('rechaza intervaloConmutacionMinimoSeg no numérico o fuera de rango', () => {
    expect(validarConfiguracionSistema('rapido' as any, undefined)).toMatch(/número/i);
    expect(validarConfiguracionSistema(-5, undefined)).toMatch(/entre 10 y 3600/i);
    expect(validarConfiguracionSistema(0, undefined)).toMatch(/entre 10 y 3600/i);
    expect(validarConfiguracionSistema(10000, undefined)).toMatch(/entre 10 y 3600/i);
  });

  it('acepta intervaloConmutacionMinimoSeg dentro de rango', () => {
    expect(validarConfiguracionSistema(120, undefined)).toBeNull();
  });

  it('rechaza sensoresHabilitados con clave desconocida', () => {
    expect(validarConfiguracionSistema(undefined, { dht1: true, sensorFantasma: false })).toMatch(/desconocida/i);
  });

  it('rechaza sensoresHabilitados con valores no booleanos', () => {
    expect(validarConfiguracionSistema(undefined, { dht1: 'si' as any })).toMatch(/booleano/i);
  });

  it('acepta sensoresHabilitados válido', () => {
    expect(validarConfiguracionSistema(undefined, { dht1: true, mq1: false })).toBeNull();
  });
});
