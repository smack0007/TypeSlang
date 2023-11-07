#include <stdint.h>
#include <stdio.h>
#define FMT_HEADER_ONLY
#include <fmt/core.h>

typedef int32_t i32;
typedef float_t f32;
typedef double_t f64;

#include "array.cpp"
#include "console.cpp"
#include "string.cpp"

typedef JS::String string;

JS::Console console;
