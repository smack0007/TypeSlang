#include "stdio.h"
#include "stdint.h"
typedef int32_t i32;

class Console {
  public: void info(const char* value) {
    printf("%s\n", value);
  }
};

Console console;