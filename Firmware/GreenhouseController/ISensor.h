/**
 * @file ISensor.h
 * @description Interfaz base para cualquier sensor físico. Permite reemplazar hardware
 * (ej. cambiar MQ135 por un NDIR de CO2) sin tocar SensorManager ni el núcleo de control.
 */
#ifndef ISENSOR_H
#define ISENSOR_H

#include <Arduino.h>

class ISensor {
public:
    virtual ~ISensor() = default;
    virtual void inicializar() = 0;
    virtual bool leer() = 0; // retorna true si la lectura cruda es plausible (no NaN, en rango físico)
    virtual bool estaHabilitado() const = 0;
    virtual void establecerHabilitado(bool habilitado) = 0;
};

#endif // ISENSOR_H
