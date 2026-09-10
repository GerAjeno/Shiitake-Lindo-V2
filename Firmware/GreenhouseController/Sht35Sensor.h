/**
 * @file Sht35Sensor.h
 * @description Sensor SHT35-RS485 (modelo LY485) — reemplaza a DhtSensor/DHT22. Se apoya en el
 * bus Modbus compartido (Sht35Direccionador::leerSensor(), ver ese archivo para el protocolo) y
 * conserva los mismos 3 filtros de validación que tenía DhtSensor (rango físico, salto máximo vs.
 * mediana de las últimas 5 lecturas, declaración de fallo/recuperación tras N lecturas
 * consecutivas) — el SHT35 es más preciso que el DHT22 pero igual de expuesto a ruido eléctrico
 * en un cableado largo dentro del invernadero, así que estos filtros siguen siendo necesarios.
 */
#ifndef SHT35SENSOR_H
#define SHT35SENSOR_H

#include "ITempHumiditySensor.h"
#include "Sht35Direccionador.h"
#include "Config.h"

class Sht35Sensor : public ITempHumiditySensor {
public:
    Sht35Sensor(Sht35Direccionador* bus, uint8_t direccionModbus, const char* nombre);

    void inicializar() override; // no-op: el bus (UART/mutex) ya lo inicializa Sht35Direccionador, compartido entre los 4
    bool leer() override;
    bool estaHabilitado() const override { return _habilitado; }
    void establecerHabilitado(bool habilitado) override { _habilitado = habilitado; }
    LecturaDHT obtenerLectura() const override { return _ultimaLectura; }

private:
    Sht35Direccionador* _bus;
    uint8_t _direccion;
    const char* _nombre;
    bool _habilitado = true;

    float _historialHumedad[5] = { NAN, NAN, NAN, NAN, NAN };
    float _historialTemperatura[5] = { NAN, NAN, NAN, NAN, NAN };
    uint8_t _indiceHistorial = 0;
    uint8_t _muestrasValidasAcumuladas = 0;

    uint8_t _fallosConsecutivos = 0;
    uint8_t _exitosConsecutivos = 0;

    LecturaDHT _ultimaLectura;

    float medianaDe5(const float* valores) const;
    bool enRangoFisico(float humedad, float temperatura) const;
    bool saltoAceptable(float humedad, float temperatura) const;
};

#endif // SHT35SENSOR_H
