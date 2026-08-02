#ifndef ITEMPHUMIDITYSENSOR_H
#define ITEMPHUMIDITYSENSOR_H

#include "ISensor.h"
#include "Types.h"

class ITempHumiditySensor : public ISensor {
public:
    virtual LecturaDHT obtenerLectura() const = 0;
};

#endif // ITEMPHUMIDITYSENSOR_H
