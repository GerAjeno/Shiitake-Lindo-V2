#ifndef IAIRQUALITYSENSOR_H
#define IAIRQUALITYSENSOR_H

#include "ISensor.h"
#include "Types.h"

class IAirQualitySensor : public ISensor {
public:
    virtual LecturaMQ obtenerLectura() const = 0;
};

#endif // IAIRQUALITYSENSOR_H
