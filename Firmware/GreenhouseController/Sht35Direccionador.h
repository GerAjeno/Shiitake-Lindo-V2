/**
 * @file Sht35Direccionador.h
 * @description Driver del bus RS485 compartido (Serial2, GPIO Config::PIN_SHT35_TX/RX) donde
 * viven los 4 sensores SHT35-RS485 (modelo LY485 de Liyuan Technology — protocolo y registros
 * confirmados contra el datasheet del fabricante). Protocolo: Modbus RTU función 0x03 (holding
 * registers) para leer, 0x06 para escribir; registro 0x0000 = humedad, 0x0001 = temperatura
 * (int16, /10); Config::SHT35_REGISTRO_DIRECCION (0x0100) = dirección del esclavo; 0x0104/0x0105 =
 * corrección de fábrica de temperatura/humedad (mismo formato, ver `calibrar()`).
 *
 * `leerSensor()` y `calibrar()` son PERMANENTES — el primero lo usa `Sht35Sensor` (ver
 * Sht35Sensor.h) para el control real de humedad/temperatura, reemplazando a los DHT22; el segundo
 * corrige offsets de fábrica detectados sensor por sensor. `asignarDireccion()` y
 * `escanearDireccion()`
 * en cambio son TEMPORALES — herramienta de puesta en marcha para asignar dirección definitiva
 * (1-4) a cada sensor nuevo, que vienen de fábrica todos en la dirección `1` y sin DIP switches.
 * Quitar esos dos métodos (y su uso en CloudClient/Tasks.cpp + el apartado en settings/page.tsx)
 * una vez asignadas las 4 direcciones — a diferencia de `leerSensor()`, no forman parte del
 * control normal del sistema.
 *
 * Como el bus es compartido entre la tarea de sensores (lectura continua) y la tarea de control
 * (comandos de direccionamiento puntuales), un mutex interno serializa el acceso al UART —
 * sin esto, dos tareas escribiendo/leyendo Serial2 al mismo tiempo corrompen las tramas de ambas.
 */
#ifndef SHT35DIRECCIONADOR_H
#define SHT35DIRECCIONADOR_H

#include <Arduino.h>

class Sht35Direccionador {
public:
    Sht35Direccionador(uint8_t pinTx, uint8_t pinRx, uint32_t baudios);

    void inicializar();

    // TEMPORAL, ver descripción arriba.
    /**
     * Escribe la nueva dirección en el sensor que hoy responde en `direccionActual`, y lee
     * temperatura/humedad en `nuevaDireccion` para confirmar. Devuelve false si cualquiera de
     * los dos pasos falla (con `error` describiendo cuál).
     */
    bool asignarDireccion(uint8_t direccionActual, uint8_t nuevaDireccion,
                           float& temperaturaC, float& humedadPct, String& error);

    /** PERMANENTE — lee temperatura/humedad (función 0x03) en una dirección puntual. */
    bool leerSensor(uint8_t direccion, float& temperaturaC, float& humedadPct, uint32_t timeoutMs = 400);

    // TEMPORAL, ver descripción arriba.
    /**
     * Prueba direcciones de `direccionMin` a `direccionMax` (inclusive) y devuelve la primera que
     * responda — sirve para averiguar en qué dirección está el único sensor conectado al bus
     * cuando `asignarDireccion` falla (por ejemplo, si el sensor no viene de fábrica en `1` como
     * asume el resto de esta herramienta).
     */
    bool escanearDireccion(uint8_t direccionMin, uint8_t direccionMax,
                            uint8_t& direccionEncontrada, float& temperaturaC, float& humedadPct);

    /**
     * PERMANENTE — corrige el offset de fábrica de un sensor puntual. Escribe `correccion` (en las
     * mismas unidades que la lectura: %RH o °C) en el registro de corrección de humedad (0x0105) o
     * temperatura (0x0104) — función 0x06, codificado como entero con signo x10 igual que la
     * propia medición — y relee el sensor para confirmar el valor ya corregido.
     */
    bool calibrar(uint8_t direccion, bool esHumedad, float correccion,
                   float& temperaturaC, float& humedadPct, String& error);

private:
    uint8_t _pinTx, _pinRx;
    uint32_t _baudios;
    SemaphoreHandle_t _mutexBus = nullptr;

    static uint16_t crc16Modbus(const uint8_t* datos, size_t longitud);
    void enviarTrama(const uint8_t* trama, size_t longitud);
    bool leerRespuesta(uint8_t* buffer, size_t longitudEsperada, uint32_t timeoutMs = 400);
    // Versión interna sin tomar el mutex — la usa asignarDireccion() (que ya lo tiene tomado) para
    // no bloquearse a sí misma; leerSensor() público es la que sí lo toma.
    bool leerSensorSinBloqueo(uint8_t direccion, float& temperaturaC, float& humedadPct, uint32_t timeoutMs);
};

#endif // SHT35DIRECCIONADOR_H
