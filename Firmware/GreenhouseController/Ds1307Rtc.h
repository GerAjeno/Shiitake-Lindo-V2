/**
 * @file Ds1307Rtc.h
 * @description Driver I2C para el RTC DS1307 (módulo "Tiny RTC I2C"). Registros en BCD, formato
 * de 24h, dirección fija 0x68 — protocolo estándar del chip (hoja de datos Maxim/Dallas DS1307).
 */
#ifndef DS1307RTC_H
#define DS1307RTC_H

#include "IRtc.h"
#include <Wire.h>

class Ds1307Rtc : public IRtc {
public:
    Ds1307Rtc(uint8_t pinSda, uint8_t pinScl);

    bool inicializar() override;
    bool horaValida() const override;
    time_t obtenerEpocaUtc() override;
    bool ajustarEpocaUtc(time_t epocaUtc) override;

private:
    static constexpr uint8_t DIRECCION_I2C = 0x68;

    uint8_t _pinSda, _pinScl;
    bool _horaValida = false;

    static uint8_t bcdADec(uint8_t bcd);
    static uint8_t decABcd(uint8_t dec);
    bool leerRegistros(uint8_t registroInicial, uint8_t* buffer, uint8_t cantidad);
    bool escribirRegistros(uint8_t registroInicial, const uint8_t* buffer, uint8_t cantidad);
};

#endif // DS1307RTC_H
