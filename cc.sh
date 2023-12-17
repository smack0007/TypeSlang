#!/bin/sh
SCRIPT_PATH=$(dirname $0)
set -e

cd ${SCRIPT_PATH}
# npx tsx ./src/main.ts $1 $2.cpp
# bun ./src/main.ts $1 $2.cpp
deno run --allow-read --allow-write ./src/main.ts $1 $2.cpp
clang++ -std=c++20 -D_CRT_SECURE_NO_WARNINGS -I ./ext/fmt/include -I ./src/backends/cpp -o $2 $2.cpp
