#include "CloudClient.h"

CloudClient* CloudClient::_instancia = nullptr;

CloudClient::CloudClient(ConfigCache* cache, ConfiguracionSistema* configRef)
    : _configCacheRef(cache), _configSistemaRef(configRef) {
    _instancia = this;
}

void CloudClient::inicializar(const char* host, uint16_t puerto, const char* dispositivoId, const char* token) {
    _dispositivoId = dispositivoId;
    _token = token;

    String path = "/ws?tipo=dispositivo&id=" + _dispositivoId + "&token=" + _token;
    _ws.beginSSL(host, puerto, path);
    _ws.onEvent(eventoEstatico);
    _ws.setReconnectInterval(5000);
    _ws.enableHeartbeat(15000, 3000, 2);
}

void CloudClient::procesar() {
    _ws.loop();
}

void CloudClient::eventoEstatico(WStype_t tipo, uint8_t* payload, size_t longitud) {
    if (_instancia) _instancia->manejarEvento(tipo, payload, longitud);
}

void CloudClient::manejarEvento(WStype_t tipo, uint8_t* payload, size_t longitud) {
    switch (tipo) {
        case WStype_CONNECTED:
            Serial.println("[NUBE] WebSocket conectado al backend.");
            _conectado = true;
            _ultimoContactoExitosoMillis = millis();
            break;
        case WStype_DISCONNECTED:
            Serial.println("[NUBE] WebSocket desconectado.");
            _conectado = false;
            break;
        case WStype_TEXT: {
            _ultimoContactoExitosoMillis = millis();
            String texto((char*)payload, longitud);
            procesarMensajeEntrante(texto);
            break;
        }
        default:
            break;
    }
}

uint32_t CloudClient::millisDesdeUltimoContactoExitoso() const {
    if (_ultimoContactoExitosoMillis == 0) return 0xFFFFFFFF; // nunca conectado: se trata como "muy offline"
    return millis() - _ultimoContactoExitosoMillis;
}

void CloudClient::aplicarConfiguracionZona(JsonObjectConst obj, ConfiguracionZona& zona) {
    if (obj.isNull()) return;
    if (!obj["humedadMinima"].isNull()) zona.humedadMinima = obj["humedadMinima"];
    if (!obj["humedadMaxima"].isNull()) zona.humedadMaxima = obj["humedadMaxima"];
    if (!obj["modo"].isNull()) {
        String m = obj["modo"].as<String>();
        zona.modo = (m == "MANUAL") ? ModoControl::MANUAL : (m == "TEMPORIZADO") ? ModoControl::TEMPORIZADO : ModoControl::AUTOMATICO;
    }
    if (!obj["humidificadorManual"].isNull()) zona.humidificadorManual = obj["humidificadorManual"];
    if (!obj["temporizadorEncendido"].isNull()) zona.temporizadorEncendido = obj["temporizadorEncendido"];
    if (!obj["umbralAdvertenciaMQ"].isNull()) zona.umbralAdvertenciaMQ = obj["umbralAdvertenciaMQ"];
    if (!obj["umbralAlarmaMQ"].isNull()) zona.umbralAlarmaMQ = obj["umbralAlarmaMQ"];

    JsonObjectConst ac = obj["aireAcondicionado"];
    if (!ac.isNull()) {
        if (!ac["modo"].isNull()) {
            String m = ac["modo"].as<String>();
            zona.aireAcondicionado.modo = (m == "MANUAL") ? ModoControlAc::MANUAL : ModoControlAc::AUTOMATICO;
        }
        if (!ac["temperaturaMinima"].isNull()) zona.aireAcondicionado.temperaturaMinima = ac["temperaturaMinima"];
        if (!ac["temperaturaMaxima"].isNull()) zona.aireAcondicionado.temperaturaMaxima = ac["temperaturaMaxima"];
        if (!ac["manualEncendido"].isNull()) zona.aireAcondicionado.manualEncendido = ac["manualEncendido"];
    }

    JsonArrayConst rangos = obj["rangosHorarios"];
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

void CloudClient::procesarMensajeEntrante(const String& json) {
    JsonDocument doc;
    if (deserializeJson(doc, json)) return;

    String tipoMsg = doc["tipo"] | "";
    JsonObjectConst datos = doc["datos"];

    if (tipoMsg == "configuracion") {
        aplicarConfiguracionZona(datos["atriles"], _configSistemaRef->atriles);
        aplicarConfiguracionZona(datos["descanso"], _configSistemaRef->descanso);
        if (!datos["intervaloConmutacionMinimoSeg"].isNull()) {
            _configSistemaRef->intervaloConmutacionMinimoSeg = datos["intervaloConmutacionMinimoSeg"];
        }
        JsonObjectConst sensHab = datos["sensoresHabilitados"];
        if (!sensHab.isNull()) {
            _configSistemaRef->dht1Habilitado = sensHab["dht1"] | true;
            _configSistemaRef->dht2Habilitado = sensHab["dht2"] | true;
            _configSistemaRef->dht3Habilitado = sensHab["dht3"] | true;
            _configSistemaRef->dht4Habilitado = sensHab["dht4"] | true;
            _configSistemaRef->mq1Habilitado = sensHab["mq1"] | true;
            _configSistemaRef->mq2Habilitado = sensHab["mq2"] | true;
        }
        // El servidor SIEMPRE gana (sin comparar versiones, decisión explícita del usuario).
        // Persistimos de inmediato para que sobreviva un corte de energía.
        _configCacheRef->guardarConfiguracion(*_configSistemaRef);
        Serial.println("[NUBE] Configuración recibida del servidor y aplicada + guardada en NVS.");

    } else if (tipoMsg == "comando") {
        _comandoPendiente.orderId = datos["orderId"].as<String>();
        JsonObjectConst c = datos["comando"];
        _comandoPendiente.tipo = c["tipo"].as<String>();
        _comandoPendiente.zona = c["zona"].as<String>();
        if (!c["encender"].isNull()) _comandoPendiente.valorBool = c["encender"];
        if (!c["valor"].isNull()) {
            if (c["valor"].is<float>() || c["valor"].is<int>()) _comandoPendiente.valorFloat = c["valor"];
            else _comandoPendiente.valorTexto = c["valor"].as<String>();
        }
        _comandoPendiente.pendiente = true;

    } else if (tipoMsg == "ota") {
        _otaPendiente.version = datos["version"].as<String>();
        _otaPendiente.url = datos["url"].as<String>();
        _otaPendiente.sha256 = datos["sha256"].as<String>();
        _otaPendiente.firmaBase64 = datos["firmaEd25519"].as<String>();
        String comando = datos["comando"] | "";
        _otaPendiente.pendiente = (comando == "INICIAR");
    }
}

void CloudClient::enviarJson(const JsonDocument& doc) {
    if (!_conectado) return;
    String salida;
    serializeJson(doc, salida);
    _ws.sendTXT(salida);
}

void CloudClient::enviarTelemetria(const TelemetriaActual& t) {
    JsonDocument doc;
    doc["tipo"] = "telemetria";
    JsonObject d = doc["datos"].to<JsonObject>();

    auto volcarZona = [](JsonObject o, const TelemetriaZona& z) {
        o["humedadPromedio"] = z.humedadPromedio;
        o["temperaturaPromedio"] = z.temperaturaPromedio;
        o["calidadAire"] = aTexto(z.calidadAire);
        o["tendenciaAire"] = aTexto(z.tendenciaAire);
        o["estadoHumidificador"] = z.estadoHumidificador;
        o["modoControl"] = aTexto(z.modoActual);
        o["falloCriticoDHT"] = z.falloCriticoDHT;
        o["estadoAireAcondicionado"] = z.estadoAireAcondicionado;
        o["modoControlAc"] = aTexto(z.modoAireActual);
        JsonObject ac = o["estadoDetalladoAC"].to<JsonObject>();
        ac["power"] = z.estadoDetalladoAC.power;
        ac["modoFisico"] = z.estadoDetalladoAC.modoFisico;
        ac["velocidadVentilador"] = z.estadoDetalladoAC.velocidadVentilador;
        ac["temperaturaObjetivo"] = z.estadoDetalladoAC.temperaturaObjetivo;
        ac["temperaturaInterior"] = z.estadoDetalladoAC.temperaturaInterior;
        ac["comunicacionOk"] = z.estadoDetalladoAC.comunicacionOk;
    };
    volcarZona(d["atriles"].to<JsonObject>(), t.atriles);
    volcarZona(d["descanso"].to<JsonObject>(), t.descanso);
    d["estadoWifi"] = t.estadoWifi;
    d["rssiWifi"] = t.rssiWifi;
    d["espOnline"] = true;
    d["firmwareVersion"] = t.firmwareVersion;
    d["otaEstado"] = t.otaEstado;
    d["otaProgreso"] = t.otaProgreso;

    enviarJson(doc);
}

void CloudClient::enviarSensores(const MatrizSensores& m) {
    JsonDocument doc;
    doc["tipo"] = "sensores";
    JsonObject d = doc["datos"].to<JsonObject>();
    auto volcarDht = [](JsonObject o, const LecturaDHT& l) {
        o["estado"] = aTexto(l.estado); o["temperatura"] = l.temperatura; o["humedad"] = l.humedad;
    };
    auto volcarMq = [](JsonObject o, const LecturaMQ& l) {
        o["estado"] = aTexto(l.estado); o["valorCrudo"] = l.valorCrudo; o["nivel"] = aTexto(l.nivel);
    };
    volcarDht(d["dht1"].to<JsonObject>(), m.dht1); volcarDht(d["dht2"].to<JsonObject>(), m.dht2);
    volcarDht(d["dht3"].to<JsonObject>(), m.dht3); volcarDht(d["dht4"].to<JsonObject>(), m.dht4);
    volcarMq(d["mq1"].to<JsonObject>(), m.mq1); volcarMq(d["mq2"].to<JsonObject>(), m.mq2);
    enviarJson(doc);
}

void CloudClient::enviarLoteHistorial(String jsonLoteYaListo) {
    if (!_conectado) return;
    _ws.sendTXT(jsonLoteYaListo);
}

void CloudClient::enviarAck(const String& orderId, bool ejecutado, const String& error) {
    JsonDocument doc;
    doc["tipo"] = "ack";
    JsonObject d = doc["datos"].to<JsonObject>();
    d["orderId"] = orderId;
    d["ejecutado"] = ejecutado;
    if (error.length() > 0) d["error"] = error;
    enviarJson(doc);
}

void CloudClient::registrarAlerta(const char* id, const char* tipo, const String& mensaje) {
    JsonDocument doc;
    doc["tipo"] = "alerta_dispositivo";
    JsonObject d = doc["datos"].to<JsonObject>();
    d["id"] = id; d["tipo"] = tipo; d["mensaje"] = mensaje;
    enviarJson(doc);
    Serial.printf("[ALERTA %s] %s\n", tipo, mensaje.c_str());
}

void CloudClient::registrarLog(const char* categoria, const char* nivel, const String& mensaje) {
    Serial.printf("[LOG %s/%s] %s\n", categoria, nivel, mensaje.c_str());
    // Los logs detallados del dispositivo se ven por Serial; el registro formal de auditoría en
    // Postgres lo genera el backend para acciones ORIGINADAS desde la web (ver Backend/src/ws/hub.ts).
    // Enviar cada log de firmware como mensaje de red agregaría tráfico sin un consumidor hoy.
}

ComandoEntrante CloudClient::tomarComandoPendiente() {
    ComandoEntrante copia = _comandoPendiente;
    _comandoPendiente.pendiente = false;
    return copia;
}

OtaEntrante CloudClient::tomarOtaPendiente() {
    OtaEntrante copia = _otaPendiente;
    _otaPendiente.pendiente = false;
    return copia;
}
