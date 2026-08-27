/**
 * @file Sht35Direccionador.h
 * @description TEMPORAL — herramienta de puesta en marcha para asignar dirección Modbus a cada
 * sensor SHT35-RS485 (vienen todos de fábrica con la misma dirección, `1`, y no tienen DIP
 * switches para cambiarla). Se conecta UN sensor físico a la vez al bus RS485 y se le asigna una
 * dirección definitiva (1-4) escribiendo el holding register Config::SHT35_REGISTRO_DIRECCION
 * (función Modbus 0x06), y se lee temperatura/humedad en la nueva dirección (función 0x04) para
 * confirmar en la web que fue el sensor correcto el que respondió antes de pasar al siguiente.
 *
 * Registro y protocolo confirmados contra el diseño de referencia "XY-MD02", que la mayoría de
 * estos módulos genéricos clona: holding register 0x0101 = dirección esclavo, input registers
 * 0x0000/0x0001 = temperatura/humedad (int16, /10). Si tu módulo puntual no responde, puede tener
 * un mapa de registros distinto — avisar para ajustar antes de seguir.
 *
 * Quitar este archivo (y su uso en CloudClient/Tasks.cpp + el apartado en settings/page.tsx) una
 * vez asignadas las 4 direcciones definitivas — no forma parte del control normal del sistema.
 */
#ifndef SHT35DIRECCIONADOR_H
#define SHT35DIRECCIONADOR_H

#include <Arduino.h>

class Sht35Direccionador {
public:
    Sht35Direccionador(uint8_t pinTx, uint8_t pinRx, uint32_t baudios);

    void inicializar();

    /**
     * Escribe la nueva dirección en el sensor que hoy responde en `direccionActual`, y lee
     * temperatura/humedad en `nuevaDireccion` para confirmar. Devuelve false si cualquiera de
     * los dos pasos falla (con `error` describiendo cuál).
     */
    bool asignarDireccion(uint8_t direccionActual, uint8_t nuevaDireccion,
                           float& temperaturaC, float& humedadPct, String& error);

    /** Lee temperatura/humedad (función 0x04) en una dirección puntual. */
    bool leerSensor(uint8_t direccion, float& temperaturaC, float& humedadPct, uint32_t timeoutMs = 400);

    /**
     * Prueba direcciones de `direccionMin` a `direccionMax` (inclusive) y devuelve la primera que
     * responda — sirve para averiguar en qué dirección está el único sensor conectado al bus
     * cuando `asignarDireccion` falla (por ejemplo, si el sensor no viene de fábrica en `1` como
     * asume el resto de esta herramienta).
     */
    bool escanearDireccion(uint8_t direccionMin, uint8_t direccionMax,
                            uint8_t& direccionEncontrada, float& temperaturaC, float& humedadPct);

private:
    uint8_t _pinTx, _pinRx;
    uint32_t _baudios;

    static uint16_t crc16Modbus(const uint8_t* datos, size_t longitud);
    void enviarTrama(const uint8_t* trama, size_t longitud);
    bool leerRespuesta(uint8_t* buffer, size_t longitudEsperada, uint32_t timeoutMs = 400);
};

#endif // SHT35DIRECCIONADOR_H
