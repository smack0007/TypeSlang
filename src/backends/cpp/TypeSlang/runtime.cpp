#include <stdint.h>
#include <stdio.h>
#define FMT_HEADER_ONLY
#include <fmt/core.h>

typedef float_t f32;
typedef double_t f64;
typedef int8_t i8;
typedef int16_t i16;
typedef int32_t i32;
typedef int64_t i64;
typedef uint8_t u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;

// clang-format off
#include "error.cpp"
#include "array.cpp"
#include "console.cpp"
#include "pointer.cpp"
#include "string.cpp"
#include "number.cpp"
// clang-format on

JS::Console console;
