/**
 * @file DhtSensor.h
 * @description Sensor DHT22 con 3 filtros de validación (rango físico, salto máximo vs.
 * mediana de las últimas 5 lecturas válidas, y declaración de fallo/recuperación tras 4
 * lecturas consecutivas). Reescrito desde cero — no reutiliza el DhtSensor del firmware anterior.
 */
#ifndef DHTSENSOR_H
#define DHTSENSOR_H

#include <DHT.h>
#include "ITempHumiditySensor.h"
#include "Config.h"

class DhtSensor : public ITempHumiditySensor {
public:
    DhtSensor(uint8_t pin, const char* nombre);

    void inicializar() override;
    bool leer() override;
    bool estaHabilitado() const override { return _habilitado; }
    void establecerHabilitado(bool habilitado) override { _habilitado = habilitado; }
    LecturaDHT obtenerLectura() const override { return _ultimaLectura; }

private:
    DHT _dht;
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

#endif // DHTSENSOR_H
