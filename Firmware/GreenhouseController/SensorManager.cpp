#include "SensorManager.h"
#include "Config.h"

SensorManager::SensorManager()
    : _dht1(Config::PIN_DHT1, "DHT1"), _dht2(Config::PIN_DHT2, "DHT2"),
      _dht3(Config::PIN_DHT3, "DHT3"), _dht4(Config::PIN_DHT4, "DHT4"),
      _mq1(Config::PIN_MQ1), _mq2(Config::PIN_MQ2) {}

void SensorManager::inicializar() {
    _dht1.inicializar(); _dht2.inicializar(); _dht3.inicializar(); _dht4.inicializar();
    _mq1.inicializar(); _mq2.inicializar();
}

void SensorManager::leerTodos() {
    // Respiro entre cada lectura DHT (bit-banging de ~5ms con interrupciones deshabilitadas):
    // leerlos pegados uno tras otro dispara fallos de lectura cruzados entre sensores y puede
    // gatillar el Interrupt Watchdog (IWDT). Mismo valor que ya estaba probado en el firmware anterior.
    _dht1.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _dht2.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _dht3.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _dht4.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _mq1.leer();
    vTaskDelay(pdMS_TO_TICKS(50));
    _mq2.leer();
}

void SensorManager::aplicarSensoresHabilitados(const ConfiguracionSistema& config) {
    _dht1.establecerHabilitado(config.dht1Habilitado);
    _dht2.establecerHabilitado(config.dht2Habilitado);
    _dht3.establecerHabilitado(config.dht3Habilitado);
    _dht4.establecerHabilitado(config.dht4Habilitado);
    _mq1.establecerHabilitado(config.mq1Habilitado);
    _mq2.establecerHabilitado(config.mq2Habilitado);
}

ResultadoZonaDHT SensorManager::calcularZona(const DhtSensor& a, const DhtSensor& b) const {
    ResultadoZonaDHT resultado;
    LecturaDHT la = a.obtenerLectura();
    LecturaDHT lb = b.obtenerLectura();
    bool aOk = la.estado == EstadoSensor::OK;
    bool bOk = lb.estado == EstadoSensor::OK;

    if (!aOk && !bOk) {
        resultado.falloCritico = true;
        return resultado;
    }
    if (aOk && !bOk) {
        resultado.humedadPromedio = la.humedad;
        resultado.temperaturaPromedio = la.temperatura;
        return resultado;
    }
    if (!aOk && bOk) {
        resultado.humedadPromedio = lb.humedad;
        resultado.temperaturaPromedio = lb.temperatura;
        return resultado;
    }

    // Ambos OK: promediar, y marcar discrepancia si difieren más de lo permitido
    // (genera alerta aguas arriba, pero se sigue controlando con el promedio — no se descarta ninguno).
    resultado.humedadPromedio = (la.humedad + lb.humedad) / 2.0f;
    resultado.temperaturaPromedio = (la.temperatura + lb.temperatura) / 2.0f;
    if (fabs(la.humedad - lb.humedad) > Config::DISCREPANCIA_MAXIMA_HUMEDAD ||
        fabs(la.temperatura - lb.temperatura) > Config::DISCREPANCIA_MAXIMA_TEMPERATURA) {
        resultado.discrepanciaExcesiva = true;
    }
    return resultado;
}

ResultadoZonaDHT SensorManager::calcularAtriles() const { return calcularZona(_dht1, _dht2); }
ResultadoZonaDHT SensorManager::calcularDescanso() const { return calcularZona(_dht3, _dht4); }

MatrizSensores SensorManager::obtenerMatriz() const {
    MatrizSensores m;
    m.dht1 = _dht1.obtenerLectura(); m.dht2 = _dht2.obtenerLectura();
    m.dht3 = _dht3.obtenerLectura(); m.dht4 = _dht4.obtenerLectura();
    m.mq1 = _mq1.obtenerLectura(); m.mq2 = _mq2.obtenerLectura();
    return m;
}
