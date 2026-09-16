#include "SensorManager.h"
#include "Config.h"

SensorManager::SensorManager(Sht35Direccionador* busSht35)
    : _dht1(Config::PIN_DHT1, "DHT1"), _dht2(Config::PIN_DHT2, "DHT2"),
      _sht1(busSht35, 1, "SHT1"), _sht2(busSht35, 2, "SHT2"),
      _sht3(busSht35, 3, "SHT3"), _sht4(busSht35, 4, "SHT4"),
      _mq1(Config::PIN_MQ1), _mq2(Config::PIN_MQ2) {}

void SensorManager::inicializar() {
    _dht1.inicializar(); _dht2.inicializar();
    _sht1.inicializar(); _sht2.inicializar(); _sht3.inicializar(); _sht4.inicializar();
    _mq1.inicializar(); _mq2.inicializar();
}

void SensorManager::leerTodos() {
    // El DHT22 necesita ~150ms de respiro tras cada lectura (bit-banging con interrupciones
    // deshabilitadas); el SHT35 no, se lee por Modbus RTU sobre UART de hardware y cada
    // transacción ya se serializa sola vía el mutex del bus (ver Sht35Direccionador).
    _dht1.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _dht2.leer();
    vTaskDelay(pdMS_TO_TICKS(150));
    _sht1.leer();
    _sht2.leer();
    _sht3.leer();
    _sht4.leer();
    _mq1.leer();
    vTaskDelay(pdMS_TO_TICKS(50));
    _mq2.leer();
}

ITempHumiditySensor* SensorManager::buscarPorId(const String& id) {
    if (id == "DHT1") return &_dht1;
    if (id == "DHT2") return &_dht2;
    if (id == "SHT1") return &_sht1;
    if (id == "SHT2") return &_sht2;
    if (id == "SHT3") return &_sht3;
    if (id == "SHT4") return &_sht4;
    return nullptr;
}

void SensorManager::aplicarConfiguracion(const ConfiguracionSistema& config) {
    _asignacionAtriles = config.asignacionAtriles;
    _asignacionDescanso = config.asignacionDescanso;

    // Un sensor no asignado a ninguna zona queda deshabilitado — cumple el mismo rol que antes
    // tenía el toggle "habilitado" propio de cada DHT/SHT35 (que ya no existe: la asignación de
    // zona es ahora la única fuente de verdad de qué sensores están en uso).
    auto estaAsignado = [this](const char* id) {
        String idStr(id);
        for (uint8_t i = 0; i < _asignacionAtriles.cantidad; i++) if (_asignacionAtriles.sensores[i] == idStr) return true;
        for (uint8_t i = 0; i < _asignacionDescanso.cantidad; i++) if (_asignacionDescanso.sensores[i] == idStr) return true;
        return false;
    };
    _dht1.establecerHabilitado(estaAsignado("DHT1"));
    _dht2.establecerHabilitado(estaAsignado("DHT2"));
    _sht1.establecerHabilitado(estaAsignado("SHT1"));
    _sht2.establecerHabilitado(estaAsignado("SHT2"));
    _sht3.establecerHabilitado(estaAsignado("SHT3"));
    _sht4.establecerHabilitado(estaAsignado("SHT4"));

    _mq1.establecerHabilitado(config.mq1Habilitado);
    _mq2.establecerHabilitado(config.mq2Habilitado);
}

ResultadoZonaDHT SensorManager::calcularZona(const AsignacionZona& asignacion) const {
    ResultadoZonaDHT resultado;
    float sumaHumedad = 0, sumaTemperatura = 0;
    float humMin = NAN, humMax = NAN, tempMin = NAN, tempMax = NAN;
    uint8_t cantidadOk = 0;

    for (uint8_t i = 0; i < asignacion.cantidad; i++) {
        ITempHumiditySensor* sensor = const_cast<SensorManager*>(this)->buscarPorId(asignacion.sensores[i]);
        if (!sensor) continue;
        LecturaDHT lectura = sensor->obtenerLectura();
        if (lectura.estado != EstadoSensor::OK) continue;

        sumaHumedad += lectura.humedad;
        sumaTemperatura += lectura.temperatura;
        if (cantidadOk == 0) {
            humMin = humMax = lectura.humedad;
            tempMin = tempMax = lectura.temperatura;
        } else {
            humMin = min(humMin, lectura.humedad); humMax = max(humMax, lectura.humedad);
            tempMin = min(tempMin, lectura.temperatura); tempMax = max(tempMax, lectura.temperatura);
        }
        cantidadOk++;
    }

    if (cantidadOk == 0) {
        resultado.falloCritico = true;
        return resultado;
    }

    // Promedio de todos los sensores OK asignados a la zona (no solo de a pares — generaliza el
    // caso de 1, 2, 3 o 4 sensores asignados). Discrepancia: rango (máximo - mínimo) entre los OK,
    // solo tiene sentido con 2 o más.
    resultado.humedadPromedio = sumaHumedad / cantidadOk;
    resultado.temperaturaPromedio = sumaTemperatura / cantidadOk;
    if (cantidadOk >= 2 && ((humMax - humMin) > Config::DISCREPANCIA_MAXIMA_HUMEDAD ||
                            (tempMax - tempMin) > Config::DISCREPANCIA_MAXIMA_TEMPERATURA)) {
        resultado.discrepanciaExcesiva = true;
    }
    return resultado;
}

ResultadoZonaDHT SensorManager::calcularAtriles() const { return calcularZona(_asignacionAtriles); }
ResultadoZonaDHT SensorManager::calcularDescanso() const { return calcularZona(_asignacionDescanso); }

MatrizSensores SensorManager::obtenerMatriz() const {
    MatrizSensores m;
    m.dht1 = _dht1.obtenerLectura(); m.dht2 = _dht2.obtenerLectura();
    m.sht1 = _sht1.obtenerLectura(); m.sht2 = _sht2.obtenerLectura();
    m.sht3 = _sht3.obtenerLectura(); m.sht4 = _sht4.obtenerLectura();
    m.mq1 = _mq1.obtenerLectura(); m.mq2 = _mq2.obtenerLectura();
    return m;
}
