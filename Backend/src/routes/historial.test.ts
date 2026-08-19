import { describe, it, expect } from 'vitest';
import { parsearRangoFechas } from './historial';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

describe('parsearRangoFechas', () => {
  it('usa el default cuando no se pasan fechas', () => {
    const rango = parsearRangoFechas({}, UN_DIA_MS, 90 * UN_DIA_MS);
    expect(rango).not.toBeNull();
    expect(rango!.hasta.getTime() - rango!.desde.getTime()).toBeCloseTo(UN_DIA_MS, -2);
  });

  it('rechaza fechas inválidas en vez de dejarlas pasar como Invalid Date', () => {
    expect(parsearRangoFechas({ desde: 'no-es-fecha', hasta: new Date().toISOString() }, UN_DIA_MS, 90 * UN_DIA_MS)).toBeNull();
    expect(parsearRangoFechas({ desde: new Date().toISOString(), hasta: 'no-es-fecha' }, UN_DIA_MS, 90 * UN_DIA_MS)).toBeNull();
  });

  it('rechaza "desde" posterior a "hasta"', () => {
    const ahora = Date.now();
    const rango = parsearRangoFechas(
      { desde: new Date(ahora).toISOString(), hasta: new Date(ahora - UN_DIA_MS).toISOString() },
      UN_DIA_MS,
      90 * UN_DIA_MS
    );
    expect(rango).toBeNull();
  });

  it('rechaza un rango que excede el máximo permitido (antes /crudo no tenía ningún tope)', () => {
    const ahora = Date.now();
    const rango = parsearRangoFechas(
      { desde: new Date(ahora - 200 * UN_DIA_MS).toISOString(), hasta: new Date(ahora).toISOString() },
      UN_DIA_MS,
      90 * UN_DIA_MS
    );
    expect(rango).toBeNull();
  });

  it('acepta un rango válido dentro del máximo', () => {
    const ahora = Date.now();
    const rango = parsearRangoFechas(
      { desde: new Date(ahora - 30 * UN_DIA_MS).toISOString(), hasta: new Date(ahora).toISOString() },
      UN_DIA_MS,
      90 * UN_DIA_MS
    );
    expect(rango).not.toBeNull();
  });
});
