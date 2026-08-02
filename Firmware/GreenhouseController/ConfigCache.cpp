#include "ConfigCache.h"
#include <ArduinoJson.h>

namespace {

void serializarZona(JsonObject obj, const ConfiguracionZona& zona) {
    obj["humedadMinima"] = zona.humedadMinima;
    obj["humedadMaxima"] = zona.humedadMaxima;
    obj["modo"] = (int)zona.modo;
    obj["humidificadorManual"] = zona.humidificadorManual;
    obj["temporizadorEncendido"] = zona.temporizadorEncendido;
    obj["umbralAdvertenciaMQ"] = zona.umbralAdvertenciaMQ;
    obj["umbralAlarmaMQ"] = zona.umbralAlarmaMQ;

    JsonObject ac = obj["ac"].to<JsonObject>();
    ac["modo"] = (int)zona.aireAcondicionado.modo;
    ac["temperaturaMinima"] = zona.aireAcondicionado.temperaturaMinima;
    ac["temperaturaMaxima"] = zona.aireAcondicionado.temperaturaMaxima;
    ac["manualEncendido"] = zona.aireAcondicionado.manualEncendido;

    JsonArray rangos = obj["rangos"].to<JsonArray>();
    for (uint8_t i = 0; i < zona.cantidadRangos; i++) {
        JsonObject r = rangos.add<JsonObject>();
        r["id"] = zona.rangosHorarios[i].id;
        r["inicio"] = zona.rangosHorarios[i].inicio;
        r["fin"] = zona.rangosHorarios[i].fin;
        r["habilitado"] = zona.rangosHorarios[i].habilitado;
    }
}

void deserializarZona(JsonObjectConst obj, ConfiguracionZona& zona) {
    if (obj.isNull()) return;
    zona.humedadMinima = obj["humedadMinima"] | zona.humedadMinima;
    zona.humedadMaxima = obj["humedadMaxima"] | zona.humedadMaxima;
    zona.modo = (ModoControl)(int)(obj["modo"] | (int)zona.modo);
    zona.humidificadorManual = obj["humidificadorManual"] | zona.humidificadorManual;
    zona.temporizadorEncendido = obj["temporizadorEncendido"] | zona.temporizadorEncendido;
    zona.umbralAdvertenciaMQ = obj["umbralAdvertenciaMQ"] | zona.umbralAdvertenciaMQ;
    zona.umbralAlarmaMQ = obj["umbralAlarmaMQ"] | zona.umbralAlarmaMQ;

    JsonObjectConst ac = obj["ac"];
    if (!ac.isNull()) {
        zona.aireAcondicionado.modo = (ModoControlAc)(int)(ac["modo"] | (int)zona.aireAcondicionado.modo);
        zona.aireAcondicionado.temperaturaMinima = ac["temperaturaMinima"] | zona.aireAcondicionado.temperaturaMinima;
        zona.aireAcondicionado.temperaturaMaxima = ac["temperaturaMaxima"] | zona.aireAcondicionado.temperaturaMaxima;
        zona.aireAcondicionado.manualEncendido = ac["manualEncendido"] | zona.aireAcondicionado.manualEncendido;
    }

    JsonArrayConst rangos = obj["rangos"];
    if (!rangos.isNull()) {
        zona.cantidadRangos = 0;
        for (JsonObjectConst r : rangos) {
            if (zona.cantidadRangos >= 8) break;
            RangoHorario& destino = zona.rangosHorarios[zona.cantidadRangos];
            destino.id = r["id"].as<String>();
            destino.inicio = r["inicio"].as<String>();
            destino.fin = r["fin"].as<String>();
            destino.habilitado = r["habilitado"] | false;
            zona.cantidadRangos++;
        }
    }
}

} // namespace

void ConfigCache::inicializar() {
    _prefs.begin(NAMESPACE, false);
}

void ConfigCache::guardarConfiguracion(const ConfiguracionSistema& config) {
    JsonDocument doc;
    serializarZona(doc["atriles"].to<JsonObject>(), config.atriles);
    serializarZona(doc["descanso"].to<JsonObject>(), config.descanso);
    doc["intervaloConmutacionMinimoSeg"] = config.intervaloConmutacionMinimoSeg;
    doc["dht1"] = config.dht1Habilitado; doc["dht2"] = config.dht2Habilitado;
    doc["dht3"] = config.dht3Habilitado; doc["dht4"] = config.dht4Habilitado;
    doc["mq1"] = config.mq1Habilitado; doc["mq2"] = config.mq2Habilitado;

    String salida;
    serializeJson(doc, salida);
    _prefs.putString(CLAVE_CONFIG, salida);
}

bool ConfigCache::cargarConfiguracion(ConfiguracionSistema& config) {
    String guardado = _prefs.getString(CLAVE_CONFIG, "");
    if (guardado.length() == 0) return false;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, guardado);
    if (error) {
        Serial.printf("[NVS] Configuración cacheada corrupta, se ignora: %s\n", error.c_str());
        return false;
    }

    deserializarZona(doc["atriles"], config.atriles);
    deserializarZona(doc["descanso"], config.descanso);
    config.intervaloConmutacionMinimoSeg = doc["intervaloConmutacionMinimoSeg"] | config.intervaloConmutacionMinimoSeg;
    config.dht1Habilitado = doc["dht1"] | true; config.dht2Habilitado = doc["dht2"] | true;
    config.dht3Habilitado = doc["dht3"] | true; config.dht4Habilitado = doc["dht4"] | true;
    config.mq1Habilitado = doc["mq1"] | true; config.mq2Habilitado = doc["mq2"] | true;
    return true;
}
