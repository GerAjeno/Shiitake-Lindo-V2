#include "DhtSensor.h"
#include <algorithm>

DhtSensor::DhtSensor(uint8_t pin, const char* nombre)
    : _dht(pin, DHT22), _nombre(nombre) {}

void DhtSensor::inicializar() {
    _dht.begin();
    _ultimaLectura.estado = EstadoSensor::OFFLINE;
}

bool DhtSensor::enRangoFisico(float humedad, float temperatura) const {
    if (isnan(humedad) || isnan(temperatura)) return false;
    if (humedad < 0.0f || humedad > 100.0f) return false;
    if (temperatura < -40.0f || temperatura > 80.0f) return false;
    return true;
}

float DhtSensor::medianaDe5(const float* valores) const {
    float copia[5];
    uint8_t n = 0;
    for (uint8_t i = 0; i < 5; i++) {
        if (!isnan(valores[i])) copia[n++] = valores[i];
    }
    if (n == 0) return NAN;
    std::sort(copia, copia + n);
    return copia[n / 2];
}

bool DhtSensor::saltoAceptable(float humedad, float temperatura) const {
    // Con menos de 2 muestras previas no hay suficiente historial para juzgar un "salto": se acepta.
    if (_muestrasValidasAcumuladas < 2) return true;

    float medianaHum = medianaDe5(_historialHumedad);
    float medianaTemp = medianaDe5(_historialTemperatura);
    if (isnan(medianaHum) || isnan(medianaTemp)) return true;

    if (fabs(humedad - medianaHum) > Config::SALTO_MAXIMO_HUMEDAD_5S) return false;
    if (fabs(temperatura - medianaTemp) > Config::SALTO_MAXIMO_TEMPERATURA_5S) return false;
    return true;
}

bool DhtSensor::leer() {
    if (!_habilitado) {
        _ultimaLectura.estado = EstadoSensor::OFFLINE;
        return false;
    }

    float humedad = _dht.readHumidity();
    float temperatura = _dht.readTemperature();

    bool valida = enRangoFisico(humedad, temperatura) && saltoAceptable(humedad, temperatura);

    if (valida) {
        _historialHumedad[_indiceHistorial] = humedad;
        _historialTemperatura[_indiceHistorial] = temperatura;
        _indiceHistorial = (_indiceHistorial + 1) % 5;
        if (_muestrasValidasAcumuladas < 5) _muestrasValidasAcumuladas++;

        _fallosConsecutivos = 0;
        if (_exitosConsecutivos < 255) _exitosConsecutivos++;

        // Declarar recuperado tras N lecturas válidas consecutivas (si venía OFFLINE/inválido).
        if (_exitosConsecutivos >= Config::LECTURAS_PARA_RECUPERAR || _ultimaLectura.estado == EstadoSensor::OK) {
            _ultimaLectura.estado = EstadoSensor::OK;
            _ultimaLectura.humedad = humedad;
            _ultimaLectura.temperatura = temperatura;
        }
    } else {
        _exitosConsecutivos = 0;
        if (_fallosConsecutivos < 255) _fallosConsecutivos++;

        if (_fallosConsecutivos >= Config::LECTURAS_PARA_DECLARAR_FALLO) {
            // Ya declarado caído oficialmente: no debe quedar un valor numérico viejo asociado
            // a un estado OFFLINE/INVALIDO (confunde a la web/BD, que reciben número + estado juntos).
            _ultimaLectura.estado = isnan(humedad) || isnan(temperatura) ? EstadoSensor::OFFLINE : EstadoSensor::LECTURA_INVALIDA;
            _ultimaLectura.humedad = NAN;
            _ultimaLectura.temperatura = NAN;
        }
        // Antes de acumular 4 fallos, se conserva el último valor válido conocido (no se interrumpe el control).
    }

    return valida;
}
