import { describe, it, expect } from 'vitest';
import { condicionCategoria, condicionesDesdeQuery } from './logs';

describe('condicionCategoria', () => {
  it('CONFIG matchea tanto CONFIG como el valor legado CONFIGURACION', () => {
    const params: unknown[] = [];
    const sql = condicionCategoria(['CONFIG'], params);
    expect(sql).toContain('categoria = ANY');
    expect(params[0]).toEqual(['CONFIG', 'CONFIGURACION']);
  });

  it('SISTEMA es todo lo que NO es una categoría conocida (cajón de sastre)', () => {
    const params: unknown[] = [];
    const sql = condicionCategoria(['SISTEMA'], params);
    expect(sql).toContain('!= ALL');
    expect(params[0]).toEqual(['ACTUADOR', 'SENSOR', 'WIFI', 'CONFIG', 'CONFIGURACION']);
  });

  it('combina categorías exactas y el cajón de sastre con OR', () => {
    const params: unknown[] = [];
    const sql = condicionCategoria(['ACTUADOR', 'SISTEMA'], params);
    expect(sql).toMatch(/OR/);
    expect(params).toHaveLength(2);
  });

  it('devuelve string vacío si no hay categorías', () => {
    expect(condicionCategoria([], [])).toBe('');
  });
});

describe('condicionesDesdeQuery', () => {
  it('sin filtros no arma WHERE', () => {
    const { where, params } = condicionesDesdeQuery({});
    expect(where).toBe('');
    expect(params).toHaveLength(0);
  });

  it('ignora una fecha con formato inválido en vez de romper la consulta', () => {
    const { where, params } = condicionesDesdeQuery({ fecha: '19-08-2026' });
    expect(where).toBe('');
    expect(params).toHaveLength(0);
  });

  it('arma condición de fecha válida en zona horaria de Chile', () => {
    const { where, params } = condicionesDesdeQuery({ fecha: '2026-08-19' });
    expect(where).toContain('America/Santiago');
    expect(params).toEqual(['2026-08-19']);
  });

  it('arma condición de búsqueda de texto con comodines', () => {
    const { where, params } = condicionesDesdeQuery({ busqueda: 'humidificador' });
    expect(where).toContain('ILIKE');
    expect(params).toEqual(['%humidificador%']);
  });

  it('ignora búsqueda vacía o solo espacios', () => {
    const { where, params } = condicionesDesdeQuery({ busqueda: '   ' });
    expect(where).toBe('');
    expect(params).toHaveLength(0);
  });

  it('combina categorías + fecha + búsqueda con AND', () => {
    const { where, params } = condicionesDesdeQuery({ categorias: 'ACTUADOR,SENSOR', fecha: '2026-08-19', busqueda: 'falla' });
    expect(where).toMatch(/AND/);
    expect(params).toHaveLength(3);
  });
});
