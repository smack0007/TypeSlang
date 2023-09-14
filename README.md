# TypeSlang

## Goals
- Compile a specific subset of TypeScript to C++ (or other languages)
  - No implicit types
  - Only the syntax from TypeScript will be translated, no runtime concepts (i.e. console.log will not be translated to printf).
  - Builtin types will be mapped (i.e. u8 => uint8_t)

## Non Goals
- Compile all possible TypeScript programs to C++
