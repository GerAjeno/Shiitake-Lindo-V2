#include "Sht35Direccionador.h"
#include "Config.h"
#include <string.h>

Sht35Direccionador::Sht35Direccionador(uint8_t pinTx, uint8_t pinRx, uint32_t baudios)
    : _pinTx(pinTx), _pinRx(pinRx), _baudios(baudios) {}

void Sht35Direccionador::inicializar() {
    Serial2.begin(_baudios, SERIAL_8N1, _pinRx, _pinTx);
    _mutexBus = xSemaphoreCreateMutex();
}

uint16_t Sht35Direccionador::crc16Modbus(const uint8_t* datos, size_t longitud) {
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

void Sht35Direccionador::enviarTrama(const uint8_t* trama, size_t longitud) {
    // Respiro de turnaround antes de transmitir: el chip de auto-dirección del adaptador (detecta
    // solo cuándo hablar/escuchar) necesita un momento para soltar el bus después de haber estado
    // recibiendo una respuesta real — sin esto, la trama siguiente sale cortada al principio y
    // nadie la reconoce. Causa confirmada en campo con los 4 sensores reales: 20ms no alcanzaba
    // (fallaba siempre el que se consultaba justo después de uno que SÍ había contestado, nunca el
    // que seguía a un timeout/silencio); con 200ms los 4 sensores responden sin problema. No bajar
    // este valor sin volver a probar con los 4 sensores reales conectados a la vez.
    vTaskDelay(pdMS_TO_TICKS(200));
    while (Serial2.available()) Serial2.read(); // limpiar basura pendiente antes de transmitir
    Serial2.write(trama, longitud);
    Serial2.flush();
}

bool Sht35Direccionador::leerRespuesta(uint8_t* buffer, size_t longitudEsperada, uint32_t timeoutMs) {
    size_t leidos = 0;
    uint32_t inicio = millis();
    while (leidos < longitudEsperada && (millis() - inicio) < timeoutMs) {
        if (Serial2.available()) {
            buffer[leidos++] = Serial2.read();
        }
    }
    return leidos == longitudEsperada;
}

bool Sht35Direccionador::asignarDireccion(uint8_t direccionActual, uint8_t nuevaDireccion,
                                           float& temperaturaC, float& humedadPct, String& error) {
    // El bus se comparte con la tarea de sensores (lectura continua) — sin este mutex, una lectura
    // periódica podría interleavearse en medio de esta escritura y corromper ambas tramas.
    if (xSemaphoreTake(_mutexBus, pdMS_TO_TICKS(2000)) != pdTRUE) {
        error = "El bus RS485 está ocupado, intentá de nuevo.";
        return false;
    }

    // Paso 1: escribir el holding register de dirección (función 0x06, escritura de registro único).
    uint8_t escritura[8];
    escritura[0] = direccionActual;
    escritura[1] = 0x06;
    escritura[2] = highByte(Config::SHT35_REGISTRO_DIRECCION);
    escritura[3] = lowByte(Config::SHT35_REGISTRO_DIRECCION);
    escritura[4] = 0x00;
    escritura[5] = nuevaDireccion;
    uint16_t crcEscritura = crc16Modbus(escritura, 6);
    escritura[6] = lowByte(crcEscritura);
    escritura[7] = highByte(crcEscritura);

    enviarTrama(escritura, sizeof(escritura));

    // La función 0x06 responde con eco exacto de la trama enviada.
    uint8_t respEscritura[8];
    if (!leerRespuesta(respEscritura, sizeof(respEscritura)) || memcmp(escritura, respEscritura, sizeof(escritura)) != 0) {
        error = "El sensor en la dirección " + String(direccionActual) + " no confirmó el cambio de dirección "
                "(revisá que sea el único sensor conectado al bus ahora mismo).";
        xSemaphoreGive(_mutexBus);
        return false;
    }

    delay(300); // algunos módulos tardan en aplicar la nueva dirección antes de volver a responder

    // Paso 2: leer temperatura/humedad en la NUEVA dirección para confirmar que fue el sensor
    // correcto el que cambió (versión sin mutex: ya lo tenemos tomado desde arriba).
    if (!leerSensorSinBloqueo(nuevaDireccion, temperaturaC, humedadPct, 400)) {
        error = "Se asignó la dirección " + String(nuevaDireccion) + ", pero el sensor no respondió a la "
                "lectura de verificación en esa dirección.";
        xSemaphoreGive(_mutexBus);
        return false;
    }
    xSemaphoreGive(_mutexBus);
    return true;
}

bool Sht35Direccionador::leerSensor(uint8_t direccion, float& temperaturaC, float& humedadPct, uint32_t timeoutMs) {
    if (xSemaphoreTake(_mutexBus, pdMS_TO_TICKS(2000)) != pdTRUE) return false;
    bool resultado = leerSensorSinBloqueo(direccion, temperaturaC, humedadPct, timeoutMs);
    xSemaphoreGive(_mutexBus);
    return resultado;
}

bool Sht35Direccionador::leerSensorSinBloqueo(uint8_t direccion, float& temperaturaC, float& humedadPct, uint32_t timeoutMs) {
    // Función 0x03 (holding registers — este módulo NO soporta 0x04, confirmado con el manual del
    // fabricante). Registro 0x0000 = HUMEDAD, 0x0001 = TEMPERATURA (ese orden, no al revés).
    uint8_t lectura[8];
    lectura[0] = direccion;
    lectura[1] = 0x03;
    lectura[2] = 0x00; lectura[3] = 0x00; // registro inicial 0x0000
    lectura[4] = 0x00; lectura[5] = 0x02; // cantidad: 2 registros
    uint16_t crcLectura = crc16Modbus(lectura, 6);
    lectura[6] = lowByte(crcLectura);
    lectura[7] = highByte(crcLectura);

    enviarTrama(lectura, sizeof(lectura));

    uint8_t respLectura[9]; // dirección, función, byteCount(4), humHi, humLo, tempHi, tempLo, crcLo, crcHi
    if (!leerRespuesta(respLectura, sizeof(respLectura), timeoutMs) || respLectura[0] != direccion || respLectura[1] != 0x03 || respLectura[2] != 4) {
        return false;
    }
    uint16_t crcRecibido = (uint16_t(respLectura[8]) << 8) | respLectura[7];
    if (crc16Modbus(respLectura, 7) != crcRecibido) {
        return false; // CRC inválido — probable ruido eléctrico en el bus, no un sensor real respondiendo
    }

    uint16_t humCruda = (uint16_t(respLectura[3]) << 8) | respLectura[4];
    int16_t tempCruda = (int16_t(respLectura[5]) << 8) | respLectura[6];
    humedadPct = humCruda / 10.0f;
    temperaturaC = tempCruda / 10.0f;
    return true;
}

bool Sht35Direccionador::calibrar(uint8_t direccion, bool esHumedad, float correccion,
                                   float& temperaturaC, float& humedadPct, String& error) {
    if (xSemaphoreTake(_mutexBus, pdMS_TO_TICKS(2000)) != pdTRUE) {
        error = "El bus RS485 está ocupado, intentá de nuevo.";
        return false;
    }

    uint16_t registro = esHumedad ? 0x0105 : 0x0104;
    // Mismo formato que la medición: entero con signo, x10 (ej. -11.5 -> -115).
    int16_t valorCrudo = (int16_t)lroundf(correccion * 10.0f);

    uint8_t escritura[8];
    escritura[0] = direccion;
    escritura[1] = 0x06;
    escritura[2] = highByte(registro);
    escritura[3] = lowByte(registro);
    escritura[4] = highByte((uint16_t)valorCrudo);
    escritura[5] = lowByte((uint16_t)valorCrudo);
    uint16_t crcEscritura = crc16Modbus(escritura, 6);
    escritura[6] = lowByte(crcEscritura);
    escritura[7] = highByte(crcEscritura);

    enviarTrama(escritura, sizeof(escritura));

    uint8_t respEscritura[8];
    if (!leerRespuesta(respEscritura, sizeof(respEscritura)) || memcmp(escritura, respEscritura, sizeof(escritura)) != 0) {
        error = "El sensor en la dirección " + String(direccion) + " no confirmó la corrección.";
        xSemaphoreGive(_mutexBus);
        return false;
    }

    delay(300); // mismo respiro que asignarDireccion() — algunos módulos tardan en aplicar el cambio

    if (!leerSensorSinBloqueo(direccion, temperaturaC, humedadPct, 400)) {
        error = "Se aplicó la corrección, pero el sensor no respondió al releer para confirmar.";
        xSemaphoreGive(_mutexBus);
        return false;
    }
    xSemaphoreGive(_mutexBus);
    return true;
}

bool Sht35Direccionador::escanearDireccion(uint8_t direccionMin, uint8_t direccionMax,
                                            uint8_t& direccionEncontrada, float& temperaturaC, float& humedadPct) {
    // Timeout corto por intento (200ms): con un solo sensor en el bus, la mayoría de las
    // direcciones probadas no van a responder, y este método corre dentro del loop de control —
    // no conviene bloquearlo más de lo necesario.
    for (uint8_t direccion = direccionMin; direccion <= direccionMax; direccion++) {
        if (leerSensor(direccion, temperaturaC, humedadPct, 200)) {
            direccionEncontrada = direccion;
            return true;
        }
        if (direccion == direccionMax) break; // evita overflow si direccionMax == 255
    }
    return false;
}
