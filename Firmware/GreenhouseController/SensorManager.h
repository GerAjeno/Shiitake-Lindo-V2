/**
 * @file SensorManager.h
 * @description Orquesta la lectura del pool de hasta 6 sensores de humedad/temperatura (2 DHT22 +
 * 4 SHT35-RS485, ver Types.h/MatrizSensores) y 2 MQ135, calcula promedios por zona con redundancia
 * (si un sensor falla se usan los demás asignados a esa zona; si ninguno responde se marca
 * falloCriticoDHT), y detecta discrepancias excesivas entre los sensores de una zona (genera
 * alerta, pero NO descarta automáticamente ninguno — decisión explícita del usuario).
 *
 * Qué sensores del pool alimentan cada zona es config libre (ver
 * ConfiguracionSistema::asignacionAtriles/asignacionDescanso) — reemplaza el mapeo fijo que existía
 * cuando los 4 sensores eran todos SHT35 (direcciones 1,2->Atriles; 3,4->Descanso). Los nombres de
 * campo `ResultadoZonaDHT`/`falloCriticoDHT` se conservan tal cual en todo el stack
 * (firmware/backend/frontend/DB) por costumbre del proyecto — no implican protocolo DHT.
 */
#ifndef SENSORMANAGER_H
#define SENSORMANAGER_H

#include "DhtSensor.h"
#include "Sht35Sensor.h"
#include "Mq135Sensor.h"
#include "Types.h"

struct ResultadoZonaDHT {
    float humedadPromedio = NAN;
    float temperaturaPromedio = NAN;
    bool falloCritico = false;      // ningún sensor asignado a la zona responde
    bool discrepanciaExcesiva = false; // 2+ sensores OK pero difieren más de lo permitido
};

class SensorManager {
public:
    SensorManager(Sht35Direccionador* busSht35);
    void inicializar();
    void leerTodos();
    // Aplica la asignación de sensores por zona y el habilitado de MQ135 — reemplaza a
    // aplicarSensoresHabilitados() (los DHT/SHT35 ya no tienen un "habilitado" propio: no estar
    // asignado a ninguna zona cumple el mismo rol).
    void aplicarConfiguracion(const ConfiguracionSistema& config);

    ResultadoZonaDHT calcularAtriles() const;
    ResultadoZonaDHT calcularDescanso() const;

    LecturaMQ lecturaMQAtriles() const { return _mq1.obtenerLectura(); }
    LecturaMQ lecturaMQDescanso() const { return _mq2.obtenerLectura(); }
    TendenciaAire tendenciaAtriles() const { return _mq1.obtenerTendencia(); }
    TendenciaAire tendenciaDescanso() const { return _mq2.obtenerTendencia(); }

    MatrizSensores obtenerMatriz() const;

private:
    DhtSensor _dht1, _dht2;             // GPIO 4, GPIO 5
    Sht35Sensor _sht1, _sht2, _sht3, _sht4; // direcciones Modbus 1-4
    Mq135Sensor _mq1, _mq2;

    AsignacionZona _asignacionAtriles;
    AsignacionZona _asignacionDescanso;

    ITempHumiditySensor* buscarPorId(const String& id);
    ResultadoZonaDHT calcularZona(const AsignacionZona& asignacion) const;
};

#endif // SENSORMANAGER_H
