import { describe, it, expect, vi, afterEach } from 'vitest';
import { LimitadorMensajes, LIMITE_MENSAJES, VENTANA_LIMITE_MS } from './hub';

describe('LimitadorMensajes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite hasta el límite de mensajes dentro de la ventana', () => {
    const limitador = new LimitadorMensajes();
    for (let i = 0; i < LIMITE_MENSAJES; i++) {
      expect(limitador.permitir()).toBe(true);
    }
  });

  it('descarta mensajes que superan el límite dentro de la misma ventana', () => {
    const limitador = new LimitadorMensajes();
    for (let i = 0; i < LIMITE_MENSAJES; i++) limitador.permitir();
    expect(limitador.permitir()).toBe(false);
    expect(limitador.permitir()).toBe(false);
  });

  it('avisarUnaVez solo devuelve true la primera vez que se excede', () => {
    const limitador = new LimitadorMensajes();
    for (let i = 0; i < LIMITE_MENSAJES; i++) limitador.permitir();
    limitador.permitir(); // primer mensaje descartado
    expect(limitador.avisarUnaVez()).toBe(true);
    expect(limitador.avisarUnaVez()).toBe(false);
    expect(limitador.avisarUnaVez()).toBe(false);
  });

  it('reinicia el contador al pasar la ventana de tiempo', () => {
    vi.useFakeTimers();
    const limitador = new LimitadorMensajes();
    for (let i = 0; i < LIMITE_MENSAJES; i++) limitador.permitir();
    expect(limitador.permitir()).toBe(false);

    vi.advanceTimersByTime(VENTANA_LIMITE_MS + 1);

    expect(limitador.permitir()).toBe(true);
  });
});
