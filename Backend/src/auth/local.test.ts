import { describe, it, expect } from 'vitest';
import { hashPassword, verificarPassword, firmarSesion, verificarSesion } from './local';

describe('hashPassword / verificarPassword', () => {
  it('un hash verifica correctamente contra su propia contraseña', async () => {
    const hash = await hashPassword('miContraseñaSegura123');
    expect(await verificarPassword('miContraseñaSegura123', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('miContraseñaSegura123');
    expect(await verificarPassword('otra-cosa', hash)).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos (salt aleatorio)', async () => {
    const a = await hashPassword('repetida');
    const b = await hashPassword('repetida');
    expect(a).not.toBe(b);
  });
});

describe('firmarSesion / verificarSesion', () => {
  it('un token firmado se puede verificar y devuelve el mismo payload', () => {
    const token = firmarSesion({ uid: 'abc', email: 'a@b.com', rol: 'operador' });
    const payload = verificarSesion(token);
    expect(payload.uid).toBe('abc');
    expect(payload.email).toBe('a@b.com');
    expect(payload.rol).toBe('operador');
  });

  it('rechaza un token alterado', () => {
    const token = firmarSesion({ uid: 'abc', email: 'a@b.com', rol: 'admin' });
    const alterado = token.slice(0, -2) + 'xx';
    expect(() => verificarSesion(alterado)).toThrow();
  });
});
