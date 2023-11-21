# TypeSlang

## Goals

- Compile a specific subset of TypeScript to C++ (or other languages)
  - Perform minimal transformations on the TypeScript syntax.
  - Build a small runtime that will be compiled into the translated programs.
- Enable interop with native C and C++ libraries

## Non Goals

- Compile all possible TypeScript programs to C++
  - Full `number` compatibility will never be possible.
