/**
 * @file RelayModbusClient.h
 * @description Driver Modbus RTU limpio para el módulo de relés de 2 canales (UART/TTL,
 * NO RS-485 — confirmado con el usuario). Reemplaza los 3 protocolos redundantes del firmware
 * anterior por uno solo, y agrega LECTURA de confirmación de estado (función 0x01), que el
 * firmware anterior nunca hacía. Protocolo verificado byte a byte contra el manual del
 * fabricante (mismos frames: función 0x05 escribir bobina única, dirección broadcast 0xFF).
 */
#ifndef RELAYMODBUSCLIENT_H
#define RELAYMODBUSCLIENT_H

#include <Arduino.h>

class RelayModbusClient {
public:
    RelayModbusClient(uint8_t pinTx, uint8_t pinRx, uint32_t baudios, uint8_t direccionEsclavo);

    void inicializar();

    /** Escribe el estado de un canal (0 o 1) y espera el eco de confirmación del módulo. */
    bool escribirCanal(uint8_t canal, bool encender);

    /** Lee el estado real reportado por el módulo para ambos canales (función 0x01, lee 8 bobinas). */
    bool leerEstado(bool& canal0Encendido, bool& canal1Encendido);

private:
    uint8_t _pinTx, _pinRx;
    uint32_t _baudios;
    uint8_t _direccion;

    static uint16_t crc16Modbus(const uint8_t* datos, size_t longitud);
    void enviarTrama(uint8_t* trama, size_t longitud);
    bool leerRespuesta(uint8_t* buffer, size_t longitudEsperada, uint32_t timeoutMs = 300);
};

#endif // RELAYMODBUSCLIENT_H
