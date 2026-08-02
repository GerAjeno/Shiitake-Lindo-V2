/**
 * @file Mq135Sensor.h
 * @description Sensor de calidad de aire MQ135 (lectura analógica relativa, sin calibración
 * NDIR). Se mantiene MQ135 en esta primera versión (decisión explícita del usuario); la
 * interfaz IAirQualitySensor permite reemplazarlo por un NDIR real más adelante sin tocar
 * SensorManager ni el resto del firmware.
 */
#ifndef MQ135SENSOR_H
#define MQ135SENSOR_H

#include "IAirQualitySensor.h"

class Mq135Sensor : public IAirQualitySensor {
public:
    explicit Mq135Sensor(uint8_t pinAnalogico);

    void inicializar() override;
    bool leer() override;
    bool estaHabilitado() const override { return _habilitado; }
    void establecerHabilitado(bool habilitado) override { _habilitado = habilitado; }
    LecturaMQ obtenerLectura() const override { return _ultimaLectura; }
    TendenciaAire obtenerTendencia() const { return _tendencia; }

private:
    uint8_t _pin;
    bool _habilitado = true;
    LecturaMQ _ultimaLectura;
    TendenciaAire _tendencia = TendenciaAire::ESTABLE;
    int _historial[6] = { 0, 0, 0, 0, 0, 0 };
    uint8_t _indiceHistorial = 0;
    uint8_t _muestrasAcumuladas = 0;

    NivelCalidadAire clasificar(int valorCrudo) const;
    void actualizarTendencia(int valorCrudo);
};

#endif // MQ135SENSOR_H
