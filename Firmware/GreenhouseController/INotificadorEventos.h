/**
 * @file INotificadorEventos.h
 * @description Abstracción para registrar alertas/logs sin acoplar la lógica de control
 * (HumidifierController, AcController) directamente a CloudClient (DIP).
 */
#ifndef INOTIFICADOREVENTOS_H
#define INOTIFICADOREVENTOS_H

#include <Arduino.h>

class INotificadorEventos {
public:
    virtual ~INotificadorEventos() = default;
    virtual void registrarAlerta(const char* id, const char* tipo, const String& mensaje) = 0;
    virtual void registrarLog(const char* categoria, const char* nivel, const String& mensaje) = 0;
};

#endif // INOTIFICADOREVENTOS_H
