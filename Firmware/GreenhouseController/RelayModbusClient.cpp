#include "RelayModbusClient.h"
#include <string.h>

RelayModbusClient::RelayModbusClient(uint8_t pinTx, uint8_t pinRx, uint32_t baudios, uint8_t direccionEsclavo)
    : _pinTx(pinTx), _pinRx(pinRx), _baudios(baudios), _direccion(direccionEsclavo) {}

void RelayModbusClient::inicializar() {
    Serial1.begin(_baudios, SERIAL_8N1, _pinRx, _pinTx);
}

uint16_t RelayModbusClient::crc16Modbus(const uint8_t* datos, size_t longitud) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < longitud; i++) {
        crc ^= datos[i];
        for (uint8_t bit = 0; bit < 8; bit++) {
            if (crc & 0x0001) { crc >>= 1; crc ^= 0xA001; }
            else { crc >>= 1; }
        }
    }
    return crc;
}

void RelayModbusClient::enviarTrama(uint8_t* trama, size_t longitud) {
    while (Serial1.available()) Serial1.read(); // limpiar basura pendiente antes de transmitir
    Serial1.write(trama, longitud);
    Serial1.flush();
}

bool RelayModbusClient::leerRespuesta(uint8_t* buffer, size_t longitudEsperada, uint32_t timeoutMs) {
    size_t leidos = 0;
    uint32_t inicio = millis();
    while (leidos < longitudEsperada && (millis() - inicio) < timeoutMs) {
        if (Serial1.available()) {
            buffer[leidos++] = Serial1.read();
        } else {
            delayMicroseconds(200);
        }
    }
    if (leidos < longitudEsperada) return false;

    uint16_t crcCalculado = crc16Modbus(buffer, longitudEsperada - 2);
    uint16_t crcRecibido = buffer[longitudEsperada - 2] | (buffer[longitudEsperada - 1] << 8);
    return crcCalculado == crcRecibido;
}

bool RelayModbusClient::escribirCanal(uint8_t canal, bool encender) {
    uint8_t trama[8] = {
        _direccion, 0x05,
        0x00, canal,                              // dirección de bobina (0x0000 o 0x0001)
        (uint8_t)(encender ? 0xFF : 0x00), 0x00,   // 0xFF00 = ON, 0x0000 = OFF
        0x00, 0x00                                 // CRC (se completa abajo)
    };
    uint16_t crc = crc16Modbus(trama, 6);
    trama[6] = crc & 0xFF;
    trama[7] = (crc >> 8) & 0xFF;

    enviarTrama(trama, 8);

    uint8_t respuesta[8];
    // El módulo hace eco exacto de la trama enviada (confirmado con el manual del fabricante,
    // incluso en modo broadcast 0xFF) — si no llega o no coincide, se reporta fallo de confirmación.
    if (!leerRespuesta(respuesta, 8)) {
        Serial.println("[MODBUS] escribirCanal: sin respuesta del módulo (timeout esperando eco).");
        return false;
    }
    if (memcmp(trama, respuesta, 8) != 0) {
        Serial.print("[MODBUS] escribirCanal: eco no coincide. Enviado:");
        for (uint8_t i = 0; i < 8; i++) Serial.printf(" %02X", trama[i]);
        Serial.print(" | Recibido:");
        for (uint8_t i = 0; i < 8; i++) Serial.printf(" %02X", respuesta[i]);
        Serial.println();
        return false;
    }

    // El eco por sí solo no distingue una respuesta real del módulo de un acoplamiento eléctrico
    // TX->RX (p. ej. módulo desconectado o mal cableado, donde el ESP32 termina "escuchando" su
    // propia transmisión): se confirma además con una lectura independiente del estado real de
    // las bobinas (función 0x01, trama distinta a la de escritura) antes de declarar éxito.
    bool canal0Encendido, canal1Encendido;
    if (!leerEstado(canal0Encendido, canal1Encendido)) {
        Serial.println("[MODBUS] escribirCanal: eco OK, pero leerEstado() (función 0x01) no respondió.");
        return false;
    }
    bool estadoConfirmado = (canal == 0) ? canal0Encendido : canal1Encendido;
    if (estadoConfirmado != encender) {
        Serial.printf("[MODBUS] escribirCanal: eco OK, pero leerEstado() dice canal0=%d canal1=%d (esperaba canal=%u encender=%d).\n",
            canal0Encendido, canal1Encendido, canal, encender);
    }
    return estadoConfirmado == encender;
}

bool RelayModbusClient::leerEstado(bool& canal0Encendido, bool& canal1Encendido) {
    uint8_t trama[8] = {
        _direccion, 0x01,
        0x00, 0x00,  // dirección inicial 0x0000
        0x00, 0x08,  // leer 8 bobinas
        0x00, 0x00
    };
    uint16_t crc = crc16Modbus(trama, 6);
    trama[6] = crc & 0xFF;
    trama[7] = (crc >> 8) & 0xFF;

    enviarTrama(trama, 8);

    uint8_t respuesta[6];
    if (!leerRespuesta(respuesta, 6)) return false;
    if (respuesta[0] != _direccion || respuesta[1] != 0x01) return false;

    uint8_t datoBits = respuesta[3];
    canal0Encendido = datoBits & 0x01;
    canal1Encendido = datoBits & 0x02;
    return true;
}
