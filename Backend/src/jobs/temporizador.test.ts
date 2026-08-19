import { describe, it, expect } from 'vitest';
import { aMinutosDelDia, minutoEnVentana, debeEstarEncendido, minutosDelDiaEnSantiago } from './temporizador';
import type { RangoHorario } from '../shared/types';

describe('aMinutosDelDia', () => {
  it('convierte HH:mm a minutos del día', () => {
    expect(aMinutosDelDia('00:00')).toBe(0);
    expect(aMinutosDelDia('01:00')).toBe(60);
    expect(aMinutosDelDia('23:59')).toBe(23 * 60 + 59);
  });

  it('devuelve -1 para formatos inválidos', () => {
    expect(aMinutosDelDia('24:00')).toBe(-1);
    expect(aMinutosDelDia('12:60')).toBe(-1);
    expect(aMinutosDelDia('no-es-hora')).toBe(-1);
    expect(aMinutosDelDia('')).toBe(-1);
  });
});

describe('minutoEnVentana', () => {
  it('ventana normal (no cruza medianoche)', () => {
    expect(minutoEnVentana(30, 0, 60)).toBe(true); // 00:30 dentro de 00:00-01:00
    expect(minutoEnVentana(60, 0, 60)).toBe(false); // el fin es exclusivo
    expect(minutoEnVentana(0, 0, 60)).toBe(true); // el inicio es inclusivo
    expect(minutoEnVentana(90, 0, 60)).toBe(false);
  });

  it('ventana que cruza medianoche (ej. 22:00 -> 06:00)', () => {
    const inicio = aMinutosDelDia('22:00');
    const fin = aMinutosDelDia('06:00');
    expect(minutoEnVentana(aMinutosDelDia('23:30'), inicio, fin)).toBe(true);
    expect(minutoEnVentana(aMinutosDelDia('02:00'), inicio, fin)).toBe(true);
    expect(minutoEnVentana(aMinutosDelDia('12:00'), inicio, fin)).toBe(false);
  });

  it(
    // Este es el escenario exacto que reportó el usuario en producción: temporizado ON de 00:00 a
    // 01:00 y de 02:00 a 03:00 — a la 01:05 el humidificador debía estar OFF. La causa real no
    // estaba en esta función (ya daba el resultado correcto), sino en un offset de zona horaria
    // del firmware — pero esta prueba deja fijado el comportamiento correcto para que una futura
    // regresión de la lógica de ventanas se detecte acá, no en producción.
    'reproduce el caso reportado: 00:00-01:00 y 02:00-03:00, a las 01:05 debe estar OFF',
    () => {
      const rangos: RangoHorario[] = [
        { id: '1', inicio: '00:00', fin: '01:00', habilitado: true },
        { id: '2', inicio: '02:00', fin: '03:00', habilitado: true },
      ];
      expect(debeEstarEncendido(rangos, aMinutosDelDia('01:05'))).toBe(false);
      expect(debeEstarEncendido(rangos, aMinutosDelDia('00:30'))).toBe(true);
      expect(debeEstarEncendido(rangos, aMinutosDelDia('02:30'))).toBe(true);
    }
  );
});

describe('debeEstarEncendido', () => {
  it('ignora rangos deshabilitados', () => {
    const rangos: RangoHorario[] = [{ id: '1', inicio: '00:00', fin: '23:59', habilitado: false }];
    expect(debeEstarEncendido(rangos, 100)).toBe(false);
  });

  it('ignora rangos con horas inválidas en vez de romper', () => {
    const rangos: RangoHorario[] = [{ id: '1', inicio: 'inválido', fin: '01:00', habilitado: true }];
    expect(debeEstarEncendido(rangos, 30)).toBe(false);
  });

  it('true si cualquier rango habilitado cubre el minuto actual', () => {
    const rangos: RangoHorario[] = [
      { id: '1', inicio: '00:00', fin: '00:10', habilitado: true },
      { id: '2', inicio: '10:00', fin: '10:10', habilitado: true },
    ];
    expect(debeEstarEncendido(rangos, aMinutosDelDia('10:05'))).toBe(true);
    expect(debeEstarEncendido(rangos, aMinutosDelDia('05:00'))).toBe(false);
  });
});

describe('minutosDelDiaEnSantiago', () => {
  it('nunca devuelve 1440 (medianoche debe ser 0, no 24:00)', () => {
    // formatToParts de Intl da "24" para medianoche en algunos runtimes — si esto regresara,
    // debeEstarEncendido() compararía contra un minuto fuera de rango (0-1439) y las ventanas que
    // empiezan en 00:00 dejarían de matchear justo a la medianoche.
    for (let h = 0; h < 24; h++) {
      const fecha = new Date(Date.UTC(2026, 0, 1, h));
      const minutos = minutosDelDiaEnSantiago(fecha);
      expect(minutos).toBeGreaterThanOrEqual(0);
      expect(minutos).toBeLessThan(24 * 60);
    }
  });
});
