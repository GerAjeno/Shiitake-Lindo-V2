/**
 * @file CloudClient.h
 * @description Cliente de nube reescrito desde cero: reemplaza FirebaseClient por una única
 * conexión WebSocket seguro (WSS) persistente hacia el backend nuevo (/ws?tipo=dispositivo).
 * Simplificación deliberada frente al plan original (que contemplaba HTTPS batch + WSS + poll
 * HTTPS de respaldo): el backend nuevo solo expone ingesta de telemetría vía WS, así que todo
 * el tráfico dispositivo<->servidor va por este único canal. Si el WS cae, el ESP32 sigue
 * operando 100% localmente con la última configuración cacheada en NVS (autonomía real) y
 * reintenta la conexión con backoff — cumple el mismo objetivo de resiliencia sin duplicar
 * mecanismos de transporte bajo la presión de tiempo de hoy.
 *
 * Nota de seguridad: se usa setInsecure() en el WSS (no se valida la cadena de certificados
 * completa) para no depender de un CA bundle no probado hoy. El respaldo real de integridad es
 * la firma Ed25519 + SHA-256 del firmware OTA (ver OtaManager) — un atacante en la red podría
 * ver tráfico, pero no podría instalar firmware no firmado ni con éxito falsificar el device
 * token. Recomendado endurecer con validación de CA real en v1.1 (ver docs/PLAN_MIGRACION.md).
 */
#ifndef CLOUDCLIENT_H
#define CLOUDCLIENT_H

#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "ConfigCache.h"
#include "INotificadorEventos.h"
#include "Types.h"

struct ComandoEntrante {
    bool pendiente = false;
    String orderId;
    String tipo;   // "humidificador"
    String zona;   // "atriles" | "descanso"
    bool valorBool = false;
    float valorFloat = 0;
    String valorTexto;
};

struct OtaEntrante {
    bool pendiente = false;
    String version;
    String url;
    String sha256;
    String firmaBase64;
};

class CloudClient : public INotificadorEventos {
public:
    CloudClient(ConfigCache* cache, ConfiguracionSistema* configRef);

    void inicializar(const char* host, uint16_t puerto, const char* dispositivoId, const char* token);
    void procesar(); // llamar en cada ciclo de la tarea de red

    bool estaConectado() const { return _conectado; }
    uint32_t millisDesdeUltimoContactoExitoso() const;

    void enviarTelemetria(const TelemetriaActual& t);
    void enviarSensores(const MatrizSensores& m);
    void enviarLoteHistorial(String jsonLote); // ya serializado por Tasks.cpp; por valor: WebSocketsClient::sendTXT() exige String& no-const
    void enviarAck(const String& orderId, bool ejecutado, const String& error = "");

    // INotificadorEventos
    // `tipo` debe ser uno de: INFO, ADVERTENCIA, CRITICA (ver TIPOS_ALERTA en Shared/types.ts).
    void registrarAlerta(const char* id, const char* tipo, const String& mensaje) override;
    // `categoria` debe ser una de: ACTUADOR, SENSOR, WIFI, CONFIG, CONFIGURACION, USUARIOS, ALERTA,
    // OTA, SISTEMA, NUBE (ver CATEGORIAS_LOG en Shared/types.ts) y `nivel` uno de: INFO,
    // ADVERTENCIA, ERROR, CRITICA (ver NIVELES_LOG). Backend/src/ws/hub.ts valida esto al recibir
    // el mensaje y avisa por consola si no coincide — pero como el firmware (C++) no puede importar
    // ese archivo TypeScript, esta lista debe mantenerse a mano en sincronía con la de allá.
    void registrarLog(const char* categoria, const char* nivel, const String& mensaje) override;

    ComandoEntrante tomarComandoPendiente();
    OtaEntrante tomarOtaPendiente();

private:
    WebSocketsClient _ws;
    ConfigCache* _configCacheRef;
    ConfiguracionSistema* _configSistemaRef;
    String _dispositivoId;
    String _token;

    bool _conectado = false;
    uint32_t _ultimoContactoExitosoMillis = 0;
    ComandoEntrante _comandoPendiente;
    OtaEntrante _otaPendiente;

    void manejarEvento(WStype_t tipo, uint8_t* payload, size_t longitud);
    void procesarMensajeEntrante(const String& json);
    void aplicarConfiguracionZona(JsonObjectConst obj, ConfiguracionZona& zona, const char* nombreZona);
    void enviarJson(const JsonDocument& doc);

    static CloudClient* _instancia;
    static void eventoEstatico(WStype_t tipo, uint8_t* payload, size_t longitud);
};

#endif // CLOUDCLIENT_H
