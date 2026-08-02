#include "Mq135Sensor.h"
#include <Arduino.h>

Mq135Sensor::Mq135Sensor(uint8_t pinAnalogico) : _pin(pinAnalogico) {}

void Mq135Sensor::inicializar() {
    pinMode(_pin, INPUT);
    analogReadResolution(12); // ADC de 12 bits (0-4095) en ESP32-S3
    _ultimaLectura.estado = EstadoSensor::OFFLINE;
}

NivelCalidadAire Mq135Sensor::clasificar(int valorCrudo) const {
    // Bandas genéricas de referencia (ADC 0-4095). Los umbrales de ALERTA reales, por zona,
    // se definen en ConfiguracionZona (umbralAdvertenciaMQ/umbralAlarmaMQ) y se evalúan en
    // HumidifierController, no aquí — esta clasificación es solo descriptiva para el dashboard.
    if (valorCrudo < 1000) return NivelCalidadAire::BAJO;
    if (valorCrudo < 2000) return NivelCalidadAire::MEDIO;
    if (valorCrudo < 3000) return NivelCalidadAire::ALTO;
    return NivelCalidadAire::MUY_ALTO;
}

void Mq135Sensor::actualizarTendencia(int valorCrudo) {
    _historial[_indiceHistorial] = valorCrudo;
    _indiceHistorial = (_indiceHistorial + 1) % 6;
    if (_muestrasAcumuladas < 6) _muestrasAcumuladas++;

    if (_muestrasAcumuladas < 6) {
        _tendencia = TendenciaAire::ESTABLE;
        return;
    }
    // Promedio de la primera mitad del buffer circular vs. la segunda mitad (ventana de ~30s).
    int sumaAntigua = 0, sumaReciente = 0;
    for (uint8_t i = 0; i < 6; i++) {
        uint8_t idx = (_indiceHistorial + i) % 6; // del más antiguo al más nuevo
        if (i < 3) sumaAntigua += _historial[idx]; else sumaReciente += _historial[idx];
    }
    int diferencia = (sumaReciente / 3) - (sumaAntigua / 3);
    if (diferencia > 150) _tendencia = TendenciaAire::SUBIENDO;
    else if (diferencia < -150) _tendencia = TendenciaAire::BAJANDO;
    else _tendencia = TendenciaAire::ESTABLE;
}

bool Mq135Sensor::leer() {
    if (!_habilitado) {
        _ultimaLectura.estado = EstadoSensor::OFFLINE;
        return false;
    }

    int valorCrudo = analogRead(_pin);
    bool valida = valorCrudo >= 0 && valorCrudo <= 4095;

    if (valida) {
        _ultimaLectura.estado = EstadoSensor::OK;
        _ultimaLectura.valorCrudo = valorCrudo;
        _ultimaLectura.nivel = clasificar(valorCrudo);
        actualizarTendencia(valorCrudo);
    } else {
        _ultimaLectura.estado = EstadoSensor::LECTURA_INVALIDA;
    }
    return valida;
}
