/**
 * @file SensorManager.h
 * @description Orquesta la lectura de los 4 DHT22 y 2 MQ135, calcula promedios por zona con
 * redundancia dual (si un sensor falla se usa el otro; si ambos fallan se marca falloCriticoDHT),
 * y detecta discrepancias excesivas entre la pareja de sensores de una zona (genera alerta, pero
 * NO descarta automáticamente ninguno de los dos — decisión explícita del usuario).
 */
#ifndef SENSORMANAGER_H
#define SENSORMANAGER_H

#include "DhtSensor.h"
#include "Mq135Sensor.h"
#include "Types.h"

struct ResultadoZonaDHT {
    float humedadPromedio = NAN;
    float temperaturaPromedio = NAN;
    bool falloCritico = false;      // ambos sensores de la zona caídos
    bool discrepanciaExcesiva = false; // ambos OK pero difieren más de lo permitido
};

class SensorManager {
public:
    SensorManager();
    void inicializar();
    void leerTodos();
    void aplicarSensoresHabilitados(const ConfiguracionSistema& config);

    ResultadoZonaDHT calcularAtriles() const;
    ResultadoZonaDHT calcularDescanso() const;

    LecturaMQ lecturaMQAtriles() const { return _mq1.obtenerLectura(); }
    LecturaMQ lecturaMQDescanso() const { return _mq2.obtenerLectura(); }
    TendenciaAire tendenciaAtriles() const { return _mq1.obtenerTendencia(); }
    TendenciaAire tendenciaDescanso() const { return _mq2.obtenerTendencia(); }

    MatrizSensores obtenerMatriz() const;

private:
    DhtSensor _dht1, _dht2, _dht3, _dht4;
    Mq135Sensor _mq1, _mq2;

    ResultadoZonaDHT calcularZona(const DhtSensor& a, const DhtSensor& b) const;
};

#endif // SENSORMANAGER_H
