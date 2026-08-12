/**
 * @file IRtc.h
 * @description Abstracción de un RTC externo I2C (mismo patrón que ISensor/IAirQualitySensor —
 * permite cambiar el chip concreto, ej. DS1307 -> DS3231, sin tocar el resto del firmware).
 */
#ifndef IRTC_H
#define IRTC_H

#include <Arduino.h>

class IRtc {
public:
    virtual ~IRtc() = default;

    /** Arranca el bus I2C en los pines configurados y detecta si el módulo responde. */
    virtual bool inicializar() = 0;

    /** true si el RTC tiene una hora plausible (no perdió la batería, o ya fue ajustado). */
    virtual bool horaValida() const = 0;

    /** Época UTC leída del RTC. Solo confiable si horaValida() es true. */
    virtual time_t obtenerEpocaUtc() = 0;

    /** Escribe una época UTC en el RTC — usado para calibrarlo tras un sync NTP exitoso. */
    virtual bool ajustarEpocaUtc(time_t epocaUtc) = 0;
};

#endif // IRTC_H
